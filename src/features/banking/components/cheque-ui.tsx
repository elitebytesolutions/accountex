"use client";

import { Check as CheckIcon, CircleX, Eye, FileText, Printer, Repeat, RotateCcw, Send, StopCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BOUNCE_REASONS, ChequeSchema, type BankingOptions, type Cheque, type ChequeInput } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormActions, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import type { MenuItem } from "@/components/ui/menu";
import { Drawer, Modal } from "@/components/ui/overlay";
import { dateLabel, isoDay, Money } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { bounceCheque, chequeAction, createCheque, getCheque, replaceCheque, updateCheque } from "../api";

// ---------------------------------------------------------------- labels
export const CHEQUE_STATUS: Record<string, { tone: Tone; label: string }> = {
  IN_HAND: { tone: "neutral", label: "In hand" },
  DEPOSITED: { tone: "info", label: "Deposited" },
  CLEARED: { tone: "good", label: "Cleared" },
  BOUNCED: { tone: "danger", label: "Bounced" },
  ISSUED: { tone: "warn", label: "Issued" },
  PRESENTED: { tone: "info", label: "Presented" },
  STOPPED: { tone: "danger", label: "Stopped" },
  CANCELLED: { tone: "neutral", label: "Cancelled" },
  REPLACED: { tone: "outline", label: "Replaced" },
};
export function ChequeStatus({ status }: { status: string }) {
  const s = CHEQUE_STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export const BOUNCE_LABEL: Record<string, string> = {
  INSUFFICIENT_FUNDS: "Insufficient funds", SIGNATURE_MISMATCH: "Signature mismatch", PAYMENT_STOPPED: "Payment stopped by drawer",
  ACCOUNT_CLOSED: "Account closed", STALE_OR_POSTDATED: "Stale / post-dated", OTHER: "Other",
};

/** Number with two decimals for table cells (template `1,250,000.00`). */
export const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
export const todayIso = () => isoDay(new Date());

/** "Meezan Bank — 0123" style label of one of our bank accounts. */
export const bankLabel = (b: { title: string; last4: string | null } | null | undefined) => (b ? `${b.title}${b.last4 ? ` — ${b.last4}` : ""}` : "—");

/** Days from today to the cheque date ("Today" / +n / −n). */
export function daysTo(date: string) {
  const a = new Date(`${date}T00:00:00`).getTime(), b = new Date(`${todayIso()}T00:00:00`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export type ChequeAct = "deposit" | "present" | "clear" | "re-present" | "stop" | "cancel";
export const ACT_LABEL: Record<string, { title: string; button: string; done: string }> = {
  deposit: { title: "Deposit cheque", button: "Deposit", done: "deposited" },
  present: { title: "Mark presented", button: "Mark presented", done: "presented" },
  clear: { title: "Mark cleared", button: "Mark cleared", done: "cleared" },
  "re-present": { title: "Re-present cheque", button: "Re-present", done: "re-presented" },
  stop: { title: "Stop payment", button: "Stop cheque", done: "stopped" },
  cancel: { title: "Cancel cheque", button: "Cancel cheque", done: "cancelled" },
};

/** Row menu items for a cheque, from the actions the server allows for its direction and status. */
export function chequeMenu(c: Cheque, can: { edit?: boolean; post?: boolean; create?: boolean }, on: {
  act: (a: ChequeAct) => void; bounce: () => void; replace: () => void; edit: () => void; open: () => void;
}): MenuItem[] {
  const items: MenuItem[] = [{ label: "Open details", icon: <Eye />, onClick: on.open }];
  const has = (a: string) => c.actions.includes(a);
  if (can.post) {
    if (has("deposit")) items.push({ label: "Deposit", icon: <Send />, onClick: () => on.act("deposit") });
    if (has("present")) items.push({ label: "Mark presented", icon: <Send />, onClick: () => on.act("present") });
    if (has("clear")) items.push({ label: "Mark cleared", icon: <CheckIcon />, onClick: () => on.act("clear") });
    if (has("re-present")) items.push({ label: "Re-present", icon: <RotateCcw />, onClick: () => on.act("re-present") });
    if (has("bounce")) items.push({ label: "Mark bounced…", icon: <CircleX />, danger: true, onClick: on.bounce });
    if (has("stop")) items.push({ label: "Stop payment", icon: <StopCircle />, danger: true, onClick: () => on.act("stop") });
    if (has("replace")) items.push({ label: "Replace…", icon: <Repeat />, onClick: on.replace });
  }
  if (can.edit && has("edit")) items.push({ label: "Edit cheque", icon: <FileText />, onClick: on.edit });
  items.push({ label: "Print cheque", icon: <Printer />, onClick: () => window.print() });
  if (can.post && has("cancel")) items.push({ sep: true }, { label: c.status === "CLEARED" ? "Reverse (cancel)" : "Cancel cheque", icon: <XCircle />, danger: true, onClick: () => on.act("cancel") });
  return items;
}

// ---------------------------------------------------------------- action modal
/** Date (and bank account for a deposit / re-presentation) for a lifecycle step; posts the voucher where it applies. */
export function ChequeActModal({ cheque, action, options, onClose, onDone }: {
  cheque: Cheque; action: ChequeAct; options: BankingOptions | null; onClose: () => void; onDone: (c: Cheque) => void;
}) {
  const needsBank = cheque.direction === "RECEIVED" && (action === "deposit" || action === "re-present");
  const accounts = options?.bankAccounts.filter((b) => b.status === "ACTIVE") ?? [];
  const [date, setDate] = useState(todayIso());
  const [bank, setBank] = useState(cheque.bankAccount?.id ?? accounts[0]?.id ?? "");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = ACT_LABEL[action]!;
  const early = action === "deposit" && cheque.isPdc && date < cheque.chequeDate;
  const effect: Record<string, string> = {
    deposit: cheque.postingMode === "CLEAR_ON_DEPOSIT" ? "Clears at once and posts the bank receipt (BRV)." : "The cheque goes into clearing; nothing posts until it clears.",
    present: "The payee has presented the cheque at the bank.",
    clear: cheque.direction === "RECEIVED" ? "Posts a bank receipt: Dr bank / Cr cheques in hand." : "Posts a bank payment: Dr PDC payable / Cr bank.",
    "re-present": "Posts the receipt again and sends the cheque back to the bank.",
    stop: "Reverses the issue entry; the vendor is owed again.",
    cancel: "Every entry of this cheque that is still posted is reversed on this date.",
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await chequeAction(cheque.id, action, { date, ...(needsBank && { bankAccountId: bank || null }), remarks: remarks || null, rowVersion: cheque.rowVersion });
      onDone(c);
    } catch (e) {
      setError(errMsg(e, `Could not ${l.button.toLowerCase()}`));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={l.title} subtitle={effect[action]}
      foot={<><Button onClick={onClose}>Close</Button><Button variant={action === "stop" || action === "cancel" ? "danger" : "primary"} disabled={busy || early || (needsBank && !bank)} onClick={submit}>{busy ? "Saving…" : l.button}</Button></>}>
      <ChequeSummary cheque={cheque} />
      <FormGrid>
        <Field label={action === "deposit" ? "Deposit date" : "Date"} required error={early ? `Post-dated: can be deposited from ${dateLabel(cheque.chequeDate)}` : undefined}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={early} />
        </Field>
        {needsBank && (
          <Field label="Deposit into" required>
            <Select value={bank} onChange={(e) => setBank(e.target.value)}>
              <option value="">Choose…</option>
              {accounts.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
            </Select>
          </Field>
        )}
        {(action === "stop" || action === "cancel") && (
          <Field label="Remarks" full><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={action === "stop" ? "e.g. Lost in post" : "Why it is cancelled"} /></Field>
        )}
      </FormGrid>
      {error && <p className="hint text-danger" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Modal>
  );
}

function ChequeSummary({ cheque: c }: { cheque: Cheque }) {
  return (
    <div className="dl mb">
      <div><span>Cheque</span><b>{[c.chequeNo, c.direction === "RECEIVED" ? c.drawnOnBank?.name : c.bankAccount && bankLabel(c.bankAccount)].filter(Boolean).join(" · ")}</b></div>
      <div><span>{c.direction === "RECEIVED" ? "Customer" : "Payee"}</span><b>{c.partyName}</b></div>
      <div><span>Amount</span><b><Money value={c.amount} /></b></div>
    </div>
  );
}

// ---------------------------------------------------------------- bounce
/** Template `#acc-bounce-cheque`. */
export function BounceModal({ cheque, onClose, onDone }: { cheque: Cheque; onClose: () => void; onDone: (c: Cheque) => void }) {
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState<string>("INSUFFICIENT_FUNDS");
  const [charges, setCharges] = useState("");
  const [recover, setRecover] = useState(false);
  const [hold, setHold] = useState(!!cheque.customer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fee = Number(charges.replace(/,/g, "")) || 0;
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await bounceCheque(cheque.id, { bounceDate: date, reason, bankCharges: fee, recoverCharges: recover && fee > 0, creditHold: hold && !!cheque.customer, remarks: null, rowVersion: cheque.rowVersion }));
    } catch (e) {
      setError(errMsg(e, "Could not mark the cheque bounced"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Mark cheque as bounced"
      subtitle={cheque.direction === "RECEIVED" ? "Reverses the receipt; the customer owes the amount again." : "Reverses the issue entry; the vendor is owed again."}
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Mark bounced"}</Button></>}>
      <ChequeSummary cheque={cheque} />
      <FormGrid>
        <Field label="Bounce date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Return reason" required>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>{BOUNCE_REASONS.map((r) => <option key={r} value={r}>{BOUNCE_LABEL[r]}</option>)}</Select>
        </Field>
        <Field label="Bank charges (Rs)"><Input inputMode="decimal" placeholder="0.00" value={charges} onChange={(e) => setCharges(e.target.value)} /></Field>
        <Field label="Recover charges from customer" hint={cheque.customer ? undefined : "Only from a customer"}>
          <Select value={recover ? "yes" : "no"} disabled={!cheque.customer || fee <= 0} onChange={(e) => setRecover(e.target.value === "yes")}>
            <option value="yes">Yes — charge the customer</option><option value="no">No</option>
          </Select>
        </Field>
        {cheque.customer && <Check full label="Put the customer on credit hold (bounced cheque)" checked={hold} onChange={(e) => setHold(e.target.checked)} />}
      </FormGrid>
      {error && <p className="hint text-danger" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    </Modal>
  );
}

// ---------------------------------------------------------------- record form
type FormState = {
  direction: "RECEIVED" | "ISSUED"; party: string; accountId: string; partyName: string; chequeNo: string; drawnOnBankId: string; bankAccountId: string;
  chequeBookId: string; chequeDate: string; receivedOn: string; amount: string; remarks: string; isPdc: boolean;
};
const blank = (direction: "RECEIVED" | "ISSUED"): FormState => ({
  direction, party: "", accountId: "", partyName: "", chequeNo: "", drawnOnBankId: "", bankAccountId: "", chequeBookId: "", chequeDate: todayIso(),
  receivedOn: todayIso(), amount: "", remarks: "", isPdc: false,
});
const fromCheque = (c: Cheque): FormState => ({
  direction: c.direction as FormState["direction"], party: c.customer?.id ?? c.vendor?.id ?? (c.account ? "ACCOUNT" : ""), accountId: c.account?.id ?? "",
  partyName: c.partyName, chequeNo: c.chequeNo, drawnOnBankId: c.drawnOnBank?.id ?? "", bankAccountId: c.bankAccount?.id ?? "", chequeBookId: c.chequeBookId ?? "",
  chequeDate: c.chequeDate, receivedOn: c.receivedOn ?? c.docDate, amount: String(c.amount), remarks: c.remarks ?? "", isPdc: c.isPdc,
});

/**
 * Template "Record cheque" panel: Receive / Issue toggle, party, cheque no., bank, dates, amount, deposit-into, PDC.
 * `mode` new (panel), edit (an in-hand / issued cheque) or replace (a new cheque standing in for `cheque`).
 */
export function ChequeForm({ options, mode = "new", cheque, onSaved, onCancel, lockDirection }: {
  options: BankingOptions | null; mode?: "new" | "edit" | "replace"; cheque?: Cheque; onSaved: (c: Cheque) => void; onCancel?: () => void; lockDirection?: boolean;
}) {
  const [f, setF] = useState<FormState>(() => (cheque && mode === "edit" ? fromCheque(cheque) : { ...blank((cheque?.direction as FormState["direction"]) ?? "RECEIVED"), ...(cheque && mode === "replace" && { party: cheque.customer?.id ?? cheque.vendor?.id ?? "", partyName: cheque.partyName, amount: String(cheque.amount), bankAccountId: cheque.bankAccount?.id ?? "", drawnOnBankId: cheque.drawnOnBank?.id ?? "" }) }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setF((s) => ({ ...s, ...patch }));
  const iss = f.direction === "ISSUED";
  const parties = (iss ? options?.vendors : options?.customers) ?? [];
  const accounts = useMemo(() => options?.bankAccounts.filter((b) => b.status === "ACTIVE") ?? [], [options]);
  const books = useMemo(() => accounts.find((b) => b.id === f.bankAccountId)?.chequeBooks.filter((b) => b.status === "ACTIVE") ?? [], [accounts, f.bankAccountId]);
  const book = books.find((b) => b.id === f.chequeBookId);

  const choosePartner = (id: string) => {
    const p = parties.find((x) => x.id === id);
    set({ party: id, partyName: p ? p.name : id === "ACCOUNT" ? f.partyName : "" });
  };
  const chooseBank = (id: string) => {
    const bks = accounts.find((b) => b.id === id)?.chequeBooks.filter((b) => b.status === "ACTIVE") ?? [];
    const first = bks[0];
    set({ bankAccountId: id, chequeBookId: iss ? (first?.id ?? "") : "", ...(iss && first && mode !== "edit" && { chequeNo: String(first.nextLeafNo) }) });
  };
  const toggle = (direction: FormState["direction"]) => { setF(blank(direction)); setErrors({}); setError(null); };

  const body = (): ChequeInput | null => {
    const amount = Number(f.amount.replace(/,/g, ""));
    const raw = {
      direction: f.direction, docDate: cheque && mode === "edit" ? cheque.docDate : todayIso(), branchId: cheque?.branch.id ?? accounts.find((b) => b.id === f.bankAccountId)?.branchId ?? options?.branches[0]?.id ?? "",
      chequeNo: f.chequeNo.trim(), customerId: !iss && f.party && f.party !== "ACCOUNT" ? f.party : null, vendorId: iss && f.party && f.party !== "ACCOUNT" ? f.party : null,
      accountId: f.party === "ACCOUNT" ? f.accountId || null : null, partyName: f.partyName.trim(), drawnOnBankId: iss ? null : f.drawnOnBankId || null,
      bankAccountId: f.bankAccountId || null, chequeDate: f.chequeDate, dueDate: null, receivedOn: iss ? null : f.receivedOn || null, amount: Number.isFinite(amount) ? amount : 0,
      isPdc: f.isPdc, postingMode: f.isPdc ? "HOLD_PDC" : "DEPOSIT", chequeBookId: iss ? f.chequeBookId || null : null, crossedAcPayee: true, legacyNo: cheque?.legacyNo ?? null,
      remarks: f.remarks.trim() || null, narration: null,
    };
    const parsed = ChequeSchema.safeParse(raw);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) e[String(i.path[0] ?? "form")] ??= i.message;
      if (e.customerId || e.vendorId || e.accountId) e.party = e.customerId ?? e.vendorId ?? e.accountId!;
      setErrors(e);
      return null;
    }
    if (!f.party) { setErrors({ party: iss ? "Choose the payee" : "Choose the customer" }); return null; }
    setErrors({});
    return parsed.data;
  };

  const save = async () => {
    const b = body();
    if (!b) return;
    setBusy(true);
    setError(null);
    try {
      const saved = mode === "edit" && cheque ? await updateCheque(cheque.id, { ...b, rowVersion: cheque.rowVersion })
        : mode === "replace" && cheque ? await replaceCheque(cheque.id, { cheque: b, rowVersion: cheque.rowVersion })
          : await createCheque(b);
      if (mode === "new") setF(blank(f.direction));
      onSaved(saved);
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k === "customerId" || k === "vendorId" || k === "accountId" ? "party" : k, v[0] ?? ""])));
      setError(errMsg(e, "Could not save the cheque"));
    } finally {
      setBusy(false);
    }
  };

  const pdcAuto = f.chequeDate > (iss ? todayIso() : f.receivedOn || todayIso());
  return (
    <>
      {!lockDirection && (
        <div className="seg mb">
          <button type="button" className={cn(!iss && "active")} onClick={() => toggle("RECEIVED")}>Receive</button>
          <button type="button" className={cn(iss && "active")} onClick={() => toggle("ISSUED")}>Issue</button>
        </div>
      )}
      <FormGrid>
        <Field label={iss ? "Payee (vendor)" : "Customer"} required full error={errors.party}>
          <Select value={f.party} onChange={(e) => choosePartner(e.target.value)} aria-invalid={!!errors.party}>
            <option value="">Choose…</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
            <option value="ACCOUNT">Other — post to an account…</option>
          </Select>
        </Field>
        {f.party === "ACCOUNT" && (
          <>
            <Field label="Account" required error={errors.accountId}>
              <Select value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                <option value="">Choose…</option>
                {options?.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </Select>
            </Field>
            <Field label={iss ? "Payee name" : "Received from"} required error={errors.partyName}><Input value={f.partyName} onChange={(e) => set({ partyName: e.target.value })} /></Field>
          </>
        )}
        {iss && (
          <Field label="Issue from" required error={errors.bankAccountId}>
            <Select value={f.bankAccountId} onChange={(e) => chooseBank(e.target.value)} aria-invalid={!!errors.bankAccountId}>
              <option value="">Choose…</option>
              {accounts.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
            </Select>
          </Field>
        )}
        {iss && (
          <Field label="Cheque book" hint={book ? `Leaves ${book.firstLeafNo}–${book.lastLeafNo} · next ${book.nextLeafNo}` : f.bankAccountId ? "No active book — any leaf number" : undefined} error={errors.chequeBookId}>
            <Select value={f.chequeBookId} disabled={!books.length} onChange={(e) => { const bk = books.find((b) => b.id === e.target.value); set({ chequeBookId: e.target.value, ...(bk && { chequeNo: String(bk.nextLeafNo) }) }); }}>
              <option value="">{books.length ? "None" : "—"}</option>
              {books.map((b) => <option key={b.id} value={b.id}>{b.bookRef ?? "Book"} · {b.firstLeafNo}–{b.lastLeafNo}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Cheque no." required error={errors.chequeNo}>
          <Input placeholder="8 digits" inputMode="numeric" value={f.chequeNo} onChange={(e) => set({ chequeNo: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errors.chequeNo} />
        </Field>
        {!iss && (
          <Field label="Drawn on bank" error={errors.drawnOnBankId}>
            <Select value={f.drawnOnBankId} onChange={(e) => set({ drawnOnBankId: e.target.value })}>
              <option value="">Choose…</option>
              {options?.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Cheque date" required error={errors.chequeDate}><Input type="date" value={f.chequeDate} onChange={(e) => set({ chequeDate: e.target.value, isPdc: e.target.value > (iss ? todayIso() : f.receivedOn || todayIso()) || f.isPdc })} /></Field>
        {!iss && <Field label="Received on" error={errors.receivedOn}><Input type="date" value={f.receivedOn} onChange={(e) => set({ receivedOn: e.target.value })} /></Field>}
        <Field label="Amount (Rs)" required error={errors.amount}><Input inputMode="decimal" placeholder="0.00" value={f.amount} onChange={(e) => set({ amount: e.target.value })} aria-invalid={!!errors.amount} /></Field>
        {!iss && (
          <Field label="Deposit into" hint="Used when you deposit it">
            <Select value={f.bankAccountId} onChange={(e) => set({ bankAccountId: e.target.value })}>
              <option value="">Choose later…</option>
              {accounts.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
            </Select>
          </Field>
        )}
        <Field label={iss ? "Against bills" : "Against invoices"} full hint="Allocation to invoices and bills arrives with customer receipts (Phase 24); the cheque posts on account.">
          <Select disabled><option>On account</option></Select>
        </Field>
        <Field label="Remarks" full><Textarea rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder={iss ? "e.g. Advance against PO" : "e.g. Collected by the salesman"} /></Field>
        <Check full label={`Post-dated cheque (PDC) — hold until maturity${pdcAuto && !f.isPdc ? " (cheque date is after today)" : ""}`} checked={f.isPdc} onChange={(e) => set({ isPdc: e.target.checked })} />
      </FormGrid>
      {(error || errors.form || errors.isPdc || errors.dueDate) && <p className="hint text-danger" role="alert" style={{ marginTop: 10 }}>{error ?? errors.form ?? errors.isPdc ?? errors.dueDate}</p>}
      <FormActions>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : <Button onClick={() => { setF(blank(f.direction)); setErrors({}); setError(null); }}>Clear</Button>}
        <Button variant="primary" icon={<CheckIcon />} disabled={busy || !options} onClick={save}>{busy ? "Saving…" : mode === "edit" ? "Save changes" : mode === "replace" ? "Record replacement" : "Save cheque"}</Button>
      </FormActions>
    </>
  );
}

/** Edit an in-hand / issued cheque, or record its replacement, in a modal. */
export function ChequeFormModal({ cheque, mode, options, onClose, onSaved }: { cheque: Cheque; mode: "edit" | "replace"; options: BankingOptions | null; onClose: () => void; onSaved: (c: Cheque) => void }) {
  return (
    <Modal open onClose={onClose} wide title={mode === "edit" ? `Edit cheque ${cheque.chequeNo}` : `Replace cheque ${cheque.chequeNo}`}
      subtitle={mode === "edit" ? "The receipt / issue entry is reversed and posted again with the new details." : "Records the new cheque; the old one is marked replaced and its entries reversed."}>
      <ChequeForm options={options} mode={mode} cheque={cheque} lockDirection onCancel={onClose} onSaved={onSaved} />
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
/** A cheque with its vouchers, bounce history and row history. */
export function ChequeDrawer({ cheque: initial, onClose, footer }: { cheque: Cheque; onClose: () => void; footer?: ReactNode }) {
  const [c, setC] = useState<Cheque>(initial);
  const [tab, setTab] = useState<"details" | "history">("details");
  useEffect(() => {
    let live = true;
    getCheque(initial.id).then((x) => live && setC(x)).catch(() => undefined);
    return () => { live = false; };
  }, [initial.id]);
  const v = (x: Cheque["voucher"], label: string) => x && (
    <div><span>{label}</span><b><Link className="link" href={`/accounting/vouchers/${x.id}`}>{x.docNo}</Link> <Badge tone={x.status === "POSTED" ? "good" : x.status === "REVERSED" ? "danger" : "neutral"}>{x.status.toLowerCase()}</Badge></b></div>
  );
  return (
    <Drawer open onClose={onClose} title={`Cheque ${c.chequeNo}`} subtitle={`${c.docNo} · ${c.direction === "RECEIVED" ? "received from" : "issued to"} ${c.partyName}`} foot={footer}>
      <div className="tabs mb">
        <button type="button" className={cn(tab === "details" && "active")} onClick={() => setTab("details")}>Details</button>
        <button type="button" className={cn(tab === "history" && "active")} onClick={() => setTab("history")}>History</button>
      </div>
      {tab === "history" ? <HistoryTab schema="BankCash" table="Cheques" id={c.id} /> : (
        <>
          <div className="dl mb">
            <div><span>Status</span><b><ChequeStatus status={c.status} />{c.isPdc && <> <Badge tone="violet">PDC</Badge></>}</b></div>
            <div><span>Amount</span><b><Money value={c.amount} /></b></div>
            <div><span>Cheque date</span><b>{dateLabel(c.chequeDate)}</b></div>
            {c.receivedOn && <div><span>Received on</span><b>{dateLabel(c.receivedOn)}</b></div>}
            <div><span>{c.direction === "RECEIVED" ? "Drawn on" : "Bank"}</span><b>{c.direction === "RECEIVED" ? (c.drawnOnBank?.name ?? "—") : bankLabel(c.bankAccount)}</b></div>
            {c.direction === "RECEIVED" && <div><span>Deposit into</span><b>{bankLabel(c.bankAccount)}</b></div>}
            {c.depositedOn && <div><span>Deposited</span><b>{dateLabel(c.depositedOn)}</b></div>}
            {c.presentedOn && <div><span>Presented</span><b>{dateLabel(c.presentedOn)}</b></div>}
            {c.clearedOn && <div><span>Cleared</span><b>{dateLabel(c.clearedOn)}</b></div>}
            {c.stoppedOn && <div><span>Stopped</span><b>{dateLabel(c.stoppedOn)}</b></div>}
            {v(c.voucher, c.direction === "RECEIVED" ? "Receipt entry" : "Issue entry")}
            {v(c.clearingVoucher, "Clearing entry")}
            {c.replacedBy && <div><span>Replaced by</span><b>{c.replacedBy.docNo}</b></div>}
            {c.replaces && <div><span>Replaces</span><b>{c.replaces.docNo}</b></div>}
            {c.remarks && <div><span>Remarks</span><b>{c.remarks}</b></div>}
            <div><span>Recorded by</span><b>{c.createdBy?.name ?? "—"}</b></div>
          </div>
          {!!c.bounces?.length && (
            <>
              <h4 style={{ margin: "6px 0 8px" }}>Bounces</h4>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Date</th><th>Reason</th><th className="num">Charges</th><th>Entries</th><th>Resolution</th></tr></thead>
                <tbody>
                  {c.bounces.map((b) => (
                    <tr key={b.id}>
                      <td>{dateLabel(b.bounceDate)}</td>
                      <td>{BOUNCE_LABEL[b.reason] ?? b.reason}{b.creditHold && <small>Credit hold</small>}</td>
                      <td className="num">{amt(b.bankCharges)}{b.recoverCharges && <small>recovered</small>}</td>
                      <td>{[b.reversalVoucher, b.chargesVoucher].filter(Boolean).map((x) => <Link key={x!.id} className="link" href={`/accounting/vouchers/${x!.id}`} style={{ display: "block" }}>{x!.docNo}</Link>)}</td>
                      <td><Badge tone={b.resolution === "OPEN" ? "warn" : "good"}>{b.resolution.toLowerCase().replace("_", " ")}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}
        </>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------- one place for every modal a cheque row opens
export type ChequeDialog = { kind: "act"; cheque: Cheque; action: ChequeAct } | { kind: "bounce"; cheque: Cheque } | { kind: "edit" | "replace"; cheque: Cheque } | { kind: "open"; cheque: Cheque } | null;

export function ChequeDialogs({ dialog, options, onClose, onDone }: { dialog: ChequeDialog; options: BankingOptions | null; onClose: () => void; onDone: (msg: string, c: Cheque) => void }) {
  if (!dialog) return null;
  const c = dialog.cheque;
  if (dialog.kind === "act") return <ChequeActModal cheque={c} action={dialog.action} options={options} onClose={onClose} onDone={(x) => onDone(`Cheque ${x.chequeNo} ${ACT_LABEL[dialog.action]!.done}${dialog.action === "clear" ? ` · ${x.clearingVoucher?.docNo ?? "entry"} posted` : ""}`, x)} />;
  if (dialog.kind === "bounce") return <BounceModal cheque={c} onClose={onClose} onDone={(x) => onDone(`Cheque ${x.chequeNo} marked bounced · receipt reversed`, x)} />;
  if (dialog.kind === "edit" || dialog.kind === "replace") return <ChequeFormModal cheque={c} mode={dialog.kind} options={options} onClose={onClose} onSaved={(x) => onDone(dialog.kind === "edit" ? `Cheque ${x.chequeNo} updated` : `Replacement cheque ${x.chequeNo} recorded`, x)} />;
  return <ChequeDrawer cheque={c} onClose={onClose} />;
}
