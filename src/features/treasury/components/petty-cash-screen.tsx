"use client";

import { Coins, History, Plus, Receipt, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CashAccount, CashOptions, PettyCashFund, PettyVoucher, PettyVoucherList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { IconWell, PageHead, Panel } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { cashOptions } from "@/features/cash/api";
import { ApiError } from "@/lib/api/errors";
import {
  createPettyFund, deletePettyFund, listBranchOptions, listCashAccounts, listCustodians, listPettyFunds, setPettyFundClosed, updatePettyFund, type BranchOption,
} from "../api";
import { PettyExpenseModal, PettyExpensesPanel, PettyTopupModal, PettyTopups, SpendByCategory } from "./petty-expenses";
import { apiFieldErrors, apiMessage } from "./treasury-ui";

type Can = { create: boolean; edit: boolean; remove: boolean; post?: boolean };
type Form = { name: string; branchId: string; custodianUserId: string; imprestAmount: string; lowPct: string; criticalPct: string; cashAccountId: string };
const LOOKUPS = ["PettyCashFundStatus"];
const TONE: Record<string, Tone> = { HEALTHY: "good", TOPPED_UP: "good", LOW: "warn", CRITICAL: "danger", CLOSED: "neutral" };
/** An open fund's level follows its cash on hand against the low / critical thresholds; a closed fund stays closed. */
const levelOf = (f: PettyCashFund) => {
  if (f.status === "CLOSED") return "CLOSED";
  const pct = f.imprestAmount ? (f.balance / f.imprestAmount) * 100 : 0;
  return pct <= f.criticalPct ? "CRITICAL" : pct <= f.lowPct ? "LOW" : f.status === "TOPPED_UP" ? "TOPPED_UP" : "HEALTHY";
};
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const spentOf = (f: PettyCashFund) => Math.max(0, Math.round((f.imprestAmount - f.balance) * 100) / 100);

/** Template app/cash/petty (40-acc-core.html): fund cards, expense vouchers, top-ups, the imprest position and spend by category. */
export function PettyCashScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [funds, setFunds] = useState<PettyCashFund[] | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [freeAccounts, setFreeAccounts] = useState<CashAccount[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<PettyCashFund | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; label: string; danger?: boolean; run: () => Promise<unknown>; done: string } | null>(null);
  const [options, setOptions] = useState<CashOptions | null>(null);
  const [vouchers, setVouchers] = useState<PettyVoucherList | null>(null);
  const [expense, setExpense] = useState<{ voucher: PettyVoucher | null; fundId?: string } | null>(null);
  const [topup, setTopup] = useState<{ fundId: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPettyFunds(), listBranchOptions(), listCustodians(), listCashAccounts(), cashOptions().catch(() => null)])
      .then(([f, b, u, c, o]) => {
        if (cancelled) return;
        // cash on hand = the fund's cash account less its unreplenished vouchers (the money already paid out of the box)
        setFunds(o ? f.map((x) => ({ ...x, balance: o.pettyFunds.find((p) => p.id === x.id)?.cashOnHand ?? x.balance })) : f);
        setOptions(o);
        setBranches(b);
        setUsers(u);
        // Petty / imprest accounts without a fund can be linked to a new fund.
        setFreeAccounts(c.filter((a) => a.isActive && (a.kind === "PETTY" || a.kind === "IMPREST") && !f.some((x) => x.cashAccount.id === a.id)));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load petty cash" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const open = (f: PettyCashFund | "new") => {
    setEdit(f);
    setErrs({});
    setHistory(false);
    setForm(f === "new"
      ? { name: "", branchId: branches[0]?.id ?? "", custodianUserId: "", imprestAmount: "", lowPct: "25", criticalPct: "10", cashAccountId: "" }
      : { name: f.name, branchId: f.branch.id, custodianUserId: f.custodian?.id ?? "", imprestAmount: String(f.imprestAmount), lowPct: String(f.lowPct), criticalPct: String(f.criticalPct), cashAccountId: f.cashAccount.id });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, [k]: v } : x));
  const row = edit && edit !== "new" ? edit : null;

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const body = { name: form.name, branchId: form.branchId, custodianUserId: form.custodianUserId, imprestAmount: Number(form.imprestAmount.replace(/,/g, "")) || 0, lowPct: Number(form.lowPct), criticalPct: Number(form.criticalPct) };
    try {
      const f = row
        ? await updatePettyFund(row.id, { ...body, rowVersion: row.rowVersion })
        : await createPettyFund({ ...body, account: form.cashAccountId ? { mode: "link", cashAccountId: form.cashAccountId } : { mode: "create" } });
      toast(row ? `${f.name} saved` : `${f.name} created · cash account ${f.cashAccount.code}`, { tone: "good" });
      setEdit(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the fund"), { tone: "danger" });
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
      setEdit(null);
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update the fund"), { tone: "danger" });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const all = funds ?? [];
  const live = all.filter((f) => f.status !== "CLOSED");
  const imprest = live.reduce((s, f) => s + f.imprestAmount, 0), onHand = live.reduce((s, f) => s + f.balance, 0);
  const pct = imprest ? Math.round((onHand / imprest) * 100) : 0;

  return (
    <>
      <PageHead
        eyebrow="Cash / Petty Cash"
        title="Petty Cash"
        description="Imprest funds by branch with custodians, top-ups and small expense vouchers."
        actions={
          <>
            {can.create && live.length > 0 && <Button icon={<Receipt />} onClick={() => setExpense({ voucher: null })}>Record expense</Button>}
            {can.post && live.length > 0 && <Button variant="primary" icon={<Plus />} onClick={() => setTopup({ fundId: null })}>Top-up fund</Button>}
            {can.create && <Button variant={live.length ? "ghost" : "primary"} icon={<Plus />} onClick={() => open("new")}>New fund</Button>}
          </>
        }
      />

      {!funds && <div className="card-grid mb">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton style={{ height: 120 }} /></div>)}</div>}
      {funds && !all.length && (
        <Panel className="mb"><EmptyState icon={<Coins />} title="No petty cash funds yet" description="A fund gives a custodian a fixed imprest for small expenses; it gets its own petty cash account." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New fund</Button>} /></Panel>
      )}
      {all.length > 0 && (
        <div className="card-grid mb">
          {all.map((f) => { const level = levelOf(f); return (
            <div key={f.id} className="card" style={{ cursor: "pointer", opacity: f.status === "CLOSED" ? 0.6 : 1 }} onClick={() => open(f)}>
              <div className="row">
                <IconWell><Coins /></IconWell>
                <div><b>{f.name}</b><small className="muted" style={{ display: "block" }}>Custodian: {f.custodian?.name ?? "—"}</small></div>
                <span className="spacer" />
                <Badge tone={TONE[level] ?? "neutral"}>{labelOf(lookups, "PettyCashFundStatus", level)}</Badge>
              </div>
              <h2 style={{ margin: "12px 0 2px" }}>{rs(f.balance)}</h2>
              <small className="muted">of {rs(f.imprestAmount)} imprest</small>
              <div className={`progress mt${level === "LOW" ? " warn" : level === "CRITICAL" ? " danger" : ""}`}><i style={{ width: `${Math.min(100, Math.round((f.balance / f.imprestAmount) * 100))}%` }} /></div>
              <div className="row small mt">
                <span className="muted">{spentOf(f) > 0 ? `Spent this cycle ${rs(spentOf(f))}` : `${f.branch.name} · ${f.cashAccount.code}`}</span>
                <span className="spacer" />
                {(level === "LOW" || level === "CRITICAL") && can.post
                  ? <button type="button" className="btn sm secondary" onClick={(e) => { e.stopPropagation(); setTopup({ fundId: f.id }); }}>Top-up</button>
                  : <span className="muted">{f.cycleStartedOn ? `Since ${dateLabel(f.cycleStartedOn).slice(0, 6)}` : ""}</span>}
              </div>
            </div>
          ); })}
        </div>
      )}

      <div className="split">
        <PettyExpensesPanel options={options} can={{ edit: can.edit }} reloadKey={attempt} onEdit={(v) => setExpense({ voucher: v })} onChanged={reload} onList={setVouchers} />
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Imprest position</h3><p>All open funds</p></div></div>
            <div className="dl">
              <div><span>Total imprest</span><b>{rs(imprest)}</b></div>
              <div><span>Cash on hand</span><b>{rs(onHand)}</b></div>
              <div><span>Vouchers pending replenishment</span><b>{rs(vouchers?.pending.total ?? 0)}</b></div>
            </div>
            <div className="progress mt"><i style={{ width: `${pct}%` }} /></div>
            <small className="muted">{pct}% of imprest available across {new Set(live.map((f) => f.branch.id)).size} branch{new Set(live.map((f) => f.branch.id)).size === 1 ? "" : "es"}</small>
          </div>
          <SpendByCategory list={vouchers} />
          <PettyTopups reloadKey={attempt} can={{ post: !!can.post }} onChanged={reload} />
        </div>
      </div>

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={row ? row.name : "New petty cash fund"} subtitle={row ? `${row.cashAccount.code} · ${row.cashAccount.name}` : "Creates its petty cash account and GL account, or uses an unused petty account"} foot={
        <>
          {row && (
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Fund" : "History"}</button>
              {can.edit && <button type="button" className="btn ghost" onClick={() => setConfirm(row.status === "CLOSED"
                ? { title: `Reopen ${row.name}?`, body: "A new replenishment cycle starts today.", label: "Reopen", run: () => setPettyFundClosed(row.id, false, row.rowVersion), done: "Fund reopened" }
                : { title: `Close ${row.name}?`, body: "No new vouchers can be paid from a closed fund. Its cash account stays.", label: "Close fund", danger: true, run: () => setPettyFundClosed(row.id, true, row.rowVersion), done: "Fund closed" })}>{row.status === "CLOSED" ? "Reopen" : "Close fund"}</button>}
              {can.remove && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirm({ title: `Delete ${row.name}?`, body: "Only funds without vouchers or top-ups can be deleted. Its cash account stays.", label: "Delete", danger: true, run: () => deletePettyFund(row.id, row.rowVersion), done: "Fund deleted" })}><Trash2 />Delete</button>}
            </span>
          )}
          <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
          {(row ? can.edit : can.create) && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>}
        </>
      }>
        {row && history ? <HistoryTab schema="BankCash" table="PettyCashFunds" id={row.id} /> : form && (
          <FormGrid>
            <Field label="Fund name" required full error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Petty cash — Karachi" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Branch" required error={errs.branchId}>
              <select value={form.branchId} onChange={(e) => set("branchId", e.target.value)}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Field>
            <Field label="Custodian" required error={errs.custodianUserId} hint="Holds the cash and records the vouchers">
              <select value={form.custodianUserId} onChange={(e) => set("custodianUserId", e.target.value)}>
                <option value="">Choose…</option>
                {[...(row?.custodian && !users.some((u) => u.id === row.custodian!.id) ? [row.custodian] : []), ...users].map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Imprest amount (Rs)" required error={errs.imprestAmount} hint="The fund is topped back up to this"><input inputMode="decimal" value={form.imprestAmount} placeholder="e.g. 50,000" onChange={(e) => set("imprestAmount", e.target.value)} /></Field>
            <Field label="Low at (%)" error={errs.lowPct}><input inputMode="decimal" value={form.lowPct} onChange={(e) => set("lowPct", e.target.value)} /></Field>
            <Field label="Critical at (%)" error={errs.criticalPct}><input inputMode="decimal" value={form.criticalPct} onChange={(e) => set("criticalPct", e.target.value)} /></Field>
            {row ? (
              <Field label="Cash account" hint="Imprest, custodian and branch are copied onto it"><input value={`${row.cashAccount.code} ${row.cashAccount.name}`} readOnly /></Field>
            ) : (
              <Field label="Cash account" error={errs.account} hint={form.cashAccountId ? "Its imprest, custodian and branch will follow this fund" : "A petty cash account and GL account are created under 1110 Cash & bank"}>
                <select value={form.cashAccountId} onChange={(e) => set("cashAccountId", e.target.value)}>
                  <option value="">Create a new petty cash account</option>
                  {freeAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                </select>
              </Field>
            )}
          </FormGrid>
        )}
      </Drawer>
      <PettyExpenseModal key={expense ? (expense.voucher?.id ?? `new-${expense.fundId ?? ""}`) : "expense-closed"} open={!!expense} voucher={expense?.voucher ?? null} options={options} defaultFundId={expense?.fundId} onClose={() => setExpense(null)} onSaved={() => { setExpense(null); reload(); }} />
      <PettyTopupModal key={topup ? `t-${topup.fundId ?? ""}` : "topup-closed"} open={!!topup} fund={options?.pettyFunds.find((x) => x.id === topup?.fundId) ?? null} options={options} onClose={() => setTopup(null)} onDone={() => { setTopup(null); reload(); }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} confirmLabel={confirm?.label} danger={confirm?.danger} busy={busy} onConfirm={runConfirm}>{confirm?.body}</ConfirmDialog>
    </>
  );
}
