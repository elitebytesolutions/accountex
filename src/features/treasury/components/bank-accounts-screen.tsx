"use client";

import { ArrowDownLeft, BookCopy, Building2, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Bank, BankAccount } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { IconWell, PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { bankAccountAction, createBankAccount, deleteBankAccount, listBankAccounts, listBanks, listBranchOptions, listCurrencyOptions, updateBankAccount, type BranchOption, type CurrencyOption } from "../api";
import { BankAccountFields, bankAccountBody, blankBankAccount, toBankAccountForm, type BankAccountForm } from "./bank-account-form";
import { AddBankModal, BanksDrawer } from "./banks-drawer";
import { ChequeBooksTab } from "./cheque-books-tab";
import { apiFieldErrors, apiMessage, fmtAmount, usePostableAccounts } from "./treasury-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
const LOOKUPS = ["AccountType", "BankAccountPurpose", "BankAccountStatus", "StatementFormat", "ChequeBookStatus"];
const PURPOSE_TONE: Record<string, Tone> = { PRIMARY: "good", RUNNING_FINANCE: "info", PAYROLL: "violet" };
const STATUS_TONE: Record<string, Tone> = { ACTIVE: "good", DORMANT: "warn", CLOSED: "neutral" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const maskIban = (iban: string | null) => (iban ? `${iban.slice(0, 8)}…${iban.slice(-4)}` : null);

/** Template app/bank/accounts (40-acc-core.html): KPIs, account cards, all-accounts table, add modal; plus account drawer and Banks. */
export function BankAccountsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const accounts = usePostableAccounts();
  const [rows, setRows] = useState<BankAccount[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState<BankAccountForm | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"details" | "books" | "history">("details");
  const [form, setForm] = useState<BankAccountForm | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [banksOpen, setBanksOpen] = useState(false);
  const [addBank, setAddBank] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; danger?: boolean; run: () => Promise<unknown>; done: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listBankAccounts(), listBanks(), listBranchOptions(), listCurrencyOptions()])
      .then(([a, b, br, c]) => {
        if (cancelled) return;
        setRows(a);
        setBanks(b);
        setBranches(br);
        setCurrencies(c);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load bank accounts" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const all = rows ?? [];
  const current = all.find((a) => a.id === open) ?? null;
  const openAccount = (a: BankAccount) => {
    setOpen(a.id);
    setTab("details");
    setForm(toBankAccountForm(a));
    setErrs({});
  };

  const create = async () => {
    if (!adding) return;
    setBusy(true);
    setErrs({});
    try {
      const a = await createBankAccount({ ...bankAccountBody(adding), bankId: adding.bankId, gl: adding.glMode === "create" ? { mode: "create" } : { mode: "link", accountId: adding.glAccountId } });
      toast(`${a.bank.shortName ?? a.bank.name} •••• ${a.accountLast4} added · GL ${a.account.code}`, { tone: "good" });
      setAdding(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not add the bank account"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const saveDetails = async () => {
    if (!current || !form) return;
    setBusy(true);
    setErrs({});
    try {
      await updateBankAccount(current.id, { ...bankAccountBody(form), rowVersion: current.rowVersion });
      toast("Bank account saved", { tone: "good" });
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
      toast(confirm.done, { tone: "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update the bank account"), { tone: "danger" });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const active = all.filter((a) => a.status === "ACTIVE");
  const total = all.reduce((s, a) => s + a.balance, 0);
  const leaves = all.reduce((s, a) => s + (a.activeBook ? a.activeBook.leaves - a.activeBook.used : 0), 0);
  const rf = all.filter((a) => a.accountType === "RUNNING_FINANCE");
  const limit = rf.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const bankCount = new Set(all.map((a) => a.bank.id)).size;

  return (
    <>
      <PageHead
        eyebrow="Bank / Accounts"
        title="Bank Accounts"
        description={`Balances, reconciliation status and activity across ${bankCount} bank${bankCount === 1 ? "" : "s"}.`}
        actions={
          <>
            <Button icon={<Building2 />} onClick={() => setBanksOpen(true)}>Banks</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => { setAdding(blankBankAccount(branches[0]?.id ?? "")); setErrs({}); }}>Add Bank Account</Button>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi teal"><div className="kpi-top"><span>Total bank balance</span><span className="icon-well"><Landmark /></span></div><strong>{rows ? rs(total) : "…"}</strong><small>Book balance today</small></div>
        <div className="kpi"><div className="kpi-top"><span>Active accounts</span><span className="icon-well"><ArrowDownLeft /></span></div><strong>{active.length}</strong><small>{all.length - active.length} dormant or closed</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Cheque leaves left</span><span className="icon-well"><BookCopy /></span></div><strong>{leaves.toLocaleString("en-US")}</strong><small>In active cheque books</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Running-finance limits</span><span className="icon-well"><Wallet /></span></div><strong>{rs(limit)}</strong><small>{rf.length} {rf.length === 1 ? "facility" : "facilities"}</small></div>
      </div>

      {!rows && <div className="card-grid mb">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton style={{ height: 120 }} /></div>)}</div>}
      {rows && all.length > 0 && (
        <div className="card-grid mb">
          {all.map((a) => (
            <div key={a.id} className="card" style={{ cursor: "pointer" }} onClick={() => openAccount(a)}>
              <div className="row">
                <IconWell><Landmark /></IconWell>
                <div><b>{a.bank.shortName ?? a.bank.name}</b><small className="muted" style={{ display: "block" }}>{labelOf(lookups, "AccountType", a.accountType)} · •••• {a.accountLast4}</small></div>
                <span className="spacer" />
                <Badge tone={a.status !== "ACTIVE" ? (STATUS_TONE[a.status] ?? "neutral") : (PURPOSE_TONE[a.purpose] ?? "neutral")}>
                  {a.status !== "ACTIVE" ? labelOf(lookups, "BankAccountStatus", a.status) : labelOf(lookups, "BankAccountPurpose", a.purpose)}
                </Badge>
              </div>
              <h2 style={{ margin: "14px 0 2px" }}>{rs(a.balance)}</h2>
              <small className="muted">{[a.bankBranch ?? a.branch.name, a.accountType === "RUNNING_FINANCE" && a.creditLimit ? `Limit ${rs(a.creditLimit)}` : maskIban(a.iban) && `IBAN ${maskIban(a.iban)}`].filter(Boolean).join(" · ")}</small>
              <div className="row small mt">
                <span className="muted">{a.reconciledTo ? `Last reconciled ${a.reconciledTo}` : "Not reconciled yet"}</span>
                <span className="spacer" />
                {a.activeBook ? <Badge tone="info">{a.activeBook.leaves - a.activeBook.used} leaves</Badge> : <Badge tone="neutral">No cheque book</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel flush">
        <div className="panel-head"><div><h3>All bank accounts</h3><p>Linked to chart of accounts group 1110 Cash &amp; bank</p></div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Bank</th><th>Account title</th><th>Account no.</th><th>GL code</th><th>Branch</th><th className="num">Book balance</th><th className="num">Statement balance</th><th>Reconciled to</th><th>Status</th><th /></tr></thead>
            <tbody>
              {!rows && <tr><td colSpan={10}><Skeleton style={{ height: 18 }} /></td></tr>}
              {all.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.bank.shortName ?? a.bank.name}</b></td>
                  <td>{a.accountTitle}</td>
                  <td>•••• {a.accountLast4}</td>
                  <td>{a.account.code}</td>
                  <td>{a.branch.name}</td>
                  <td className="num">{fmtAmount(a.balance)}</td>
                  <td className="num zero">—</td>
                  <td className="muted">{a.reconciledTo ?? "—"}</td>
                  <td><Badge tone={STATUS_TONE[a.status] ?? "neutral"} dot>{labelOf(lookups, "BankAccountStatus", a.status)}</Badge></td>
                  <td className="actions"><button type="button" className="btn ghost sm" onClick={() => openAccount(a)}>Open</button></td>
                </tr>
              ))}
              {rows && all.length > 0 && <tr className="total"><td colSpan={5}>Total</td><td className="num">{fmtAmount(total)}</td><td className="num">—</td><td colSpan={3} /></tr>}
              {rows && !all.length && (
                <tr><td colSpan={10}><EmptyState icon={<Landmark />} title="No bank accounts yet" description="Add the company's bank accounts; each one gets its own GL account under Cash & bank." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setAdding(blankBankAccount(branches[0]?.id ?? ""))}>Add Bank Account</Button>} /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!adding} onClose={() => setAdding(null)} wide title="Add bank account" subtitle="Creates a linked GL account under 1110 Cash & bank" foot={
        <>
          <button type="button" className="btn secondary" onClick={() => setAdding(null)} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={create} disabled={busy}>{busy ? "Saving…" : "Add account"}</button>
        </>
      }>
        {adding && (
          <BankAccountFields form={adding} set={(k, v) => setAdding((f) => (f ? { ...f, [k]: v } : f))} errs={errs} banks={banks} branches={branches} currencies={currencies}
            accounts={accounts} lookups={lookups} existing={null} onAddBank={can.create ? () => setAddBank(true) : undefined} />
        )}
      </Modal>
      <AddBankModal open={addBank} onClose={() => setAddBank(false)} onSaved={(b) => { setAddBank(false); setBanks((all) => [...all, b].sort((x, y) => x.name.localeCompare(y.name))); setAdding((f) => (f ? { ...f, bankId: b.id } : f)); }} />

      <Drawer
        open={!!current}
        onClose={() => setOpen(null)}
        wide
        title={current ? `${current.bank.shortName ?? current.bank.name} •••• ${current.accountLast4}` : "Bank account"}
        subtitle={current ? `${current.accountTitle} · GL ${current.account.code}` : undefined}
        foot={current && tab === "details" && (
          <>
            {can.remove && <button type="button" className="btn ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => setConfirm({ title: "Delete this bank account?", body: "Only accounts without cheque books or transactions can be deleted. Its GL account stays in the chart.", label: "Delete", danger: true, run: async () => { await deleteBankAccount(current.id, current.rowVersion); setOpen(null); }, done: "Bank account deleted" })}><Trash2 />Delete</button>}
            {can.edit && current.status === "ACTIVE" && <button type="button" className="btn ghost" onClick={() => setConfirm({ title: "Mark as dormant?", body: "Dormant accounts stay in reports but aren't offered for new payments.", label: "Mark dormant", run: () => bankAccountAction(current.id, "dormant", current.rowVersion), done: "Marked dormant" })}>Mark dormant</button>}
            {can.edit && current.status !== "CLOSED" && <button type="button" className="btn ghost" onClick={() => setConfirm({ title: "Close this bank account?", body: "Closed today. Cancel or finish its active cheque book first.", label: "Close account", danger: true, run: () => bankAccountAction(current.id, "close", current.rowVersion), done: "Bank account closed" })}>Close account</button>}
            {can.edit && current.status !== "ACTIVE" && <button type="button" className="btn ghost" onClick={() => setConfirm({ title: "Reactivate this bank account?", body: "It is offered for payments and receipts again.", label: "Reactivate", run: () => bankAccountAction(current.id, "activate", current.rowVersion), done: "Bank account reactivated" })}>Reactivate</button>}
            {can.edit && <button type="button" className="btn primary" onClick={saveDetails} disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>}
          </>
        )}
      >
        {current && form && (
          <>
            <Tabs items={[{ key: "details", label: "Details" }, { key: "books", label: "Cheque books", count: current.bookCount }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            <div className="mt">
              {tab === "details" && (
                <BankAccountFields form={form} set={(k, v) => setForm((f) => (f ? { ...f, [k]: v } : f))} errs={errs} banks={banks} branches={branches} currencies={currencies}
                  accounts={accounts} lookups={lookups} existing={current} readOnly={!can.edit} />
              )}
              {tab === "books" && <ChequeBooksTab account={current} lookups={lookups} can={can} onChanged={reload} />}
              {tab === "history" && <HistoryTab schema="BankCash" table="BankAccounts" id={current.id} />}
            </div>
          </>
        )}
      </Drawer>

      <BanksDrawer open={banksOpen} onClose={() => setBanksOpen(false)} banks={banks} can={can} onChanged={reload} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} confirmLabel={confirm?.label} danger={confirm?.danger} busy={busy} onConfirm={runConfirm}>
        {confirm?.body}
      </ConfirmDialog>
    </>
  );
}
