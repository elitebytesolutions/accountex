"use client";

import { Camera, MoreHorizontal, Paperclip, Receipt, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { CashOptions, PettyReplenishment, PettyVoucher, PettyVoucherList } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { cancelReplenishment, createPettyVoucher, listPettyVouchers, listReplenishments, replenishFund, updatePettyVoucher, voidPettyVoucher } from "@/features/cash/api";
import { ApiError } from "@/lib/api/errors";
import { apiFieldErrors, apiMessage } from "./treasury-ui";

const PAGE = 15;
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string) => Number(s.replace(/,/g, "")) || 0;
const STACK = ["var(--primary)", "var(--mint)", "var(--lime)", "var(--orange)", "var(--violet)", "var(--info)"];
type PettyFundOption = CashOptions["pettyFunds"][number];

/** Template petty expenses table: search, fund, All / Unreplenished / Replenished, and the row menu. */
export function PettyExpensesPanel({ options, can, reloadKey, onEdit, onChanged, onList }: {
  options: CashOptions | null;
  can: { edit: boolean };
  reloadKey: number;
  onEdit: (v: PettyVoucher) => void;
  onChanged: () => void;
  onList: (l: PettyVoucherList) => void;
}) {
  const toast = useToast();
  const [fund, setFund] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PettyVoucherList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [voiding, setVoiding] = useState<PettyVoucher | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listPettyVouchers({ fund, status, search, page, pageSize: PAGE })
      .then((l) => { if (cancelled) return; setData(l); onList(l); setError(null); })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load petty cash expenses" }));
    return () => { cancelled = true; };
  }, [fund, status, search, page, reloadKey, onList]);

  const doVoid = async () => {
    if (!voiding) return;
    setBusy(true);
    try {
      await voidPettyVoucher(voiding.id, voiding.rowVersion);
      toast(`${voiding.docNo} voided`, { tone: "good" });
      setVoiding(null);
      onChanged();
    } catch (e) {
      toast(apiMessage(e, "Could not void the voucher"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const fundName = fund ? options?.pettyFunds.find((f) => f.id === fund)?.name : null;
  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Petty cash expenses</h3><p>{fundName ? `${fundName} imprest` : "All funds"} · current replenishment cycle</p></div></div>
      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder="Search expenses…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
        <select value={fund} onChange={(e) => { setFund(e.target.value); setPage(1); }} aria-label="Fund">
          <option value="">All funds</option>
          {options?.pettyFunds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="chips">
          {[["", "All"], ["UNREPLENISHED", "Unreplenished"], ["REPLENISHED", "Replenished"]].map(([v, l]) => <button key={l} type="button" className={cn(status === v && "active")} onClick={() => { setStatus(v!); setPage(1); }}>{l}</button>)}
        </div>
      </div>
      {error && !data ? <ErrorState message={error.message} reference={error.reference} onRetry={onChanged} /> : !data ? <Skeleton style={{ height: 300 }} /> : !items.length ? (
        <EmptyState icon={<Receipt />} title={status || search || fund ? "No expenses match" : "No expense vouchers yet"} description={status || search || fund ? "Try another fund, status or search." : "Small expenses paid from a fund are recorded with Record expense."} />
      ) : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Ref</th><th>Fund</th><th>Description</th><th>Category</th><th>Paid to</th><th className="num">Amount</th><th>Receipt</th><th>Status</th><th /></tr></thead>
          <tbody>
            {items.map((v) => (
              <tr key={v.id} style={v.status === "VOID" ? { opacity: 0.55 } : undefined}>
                <td>{dateLabel(v.docDate).slice(0, 6)}</td>
                <td><Hl text={v.docNo} q={search} /></td>
                <td>{v.fund.name}</td>
                <td><Hl text={v.description} q={search} /></td>
                <td>{v.category.name}</td>
                <td><Hl text={v.paidTo} q={search} /></td>
                <td className="num">{amt(v.amount)}</td>
                <td>{v.receiptStatus === "ATTACHED" ? <Badge tone="good"><Paperclip /> {v.receiptCount}</Badge> : v.receiptStatus === "MISSING" ? <Badge tone="warn">Missing</Badge> : <Badge>N/A</Badge>}</td>
                <td>{v.status === "REPLENISHED" ? <Badge tone="good">Replenished</Badge> : v.status === "VOID" ? <Badge tone="danger">Void</Badge> : <Badge>Unreplenished</Badge>}</td>
                <td className="actions">
                  {v.status === "UNREPLENISHED" && can.edit && (
                    <button type="button" className="icon-btn-sm" aria-label={`Actions for ${v.docNo}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: [
                      { label: "Edit", onClick: () => onEdit(v) },
                      { label: "Void", danger: true, onClick: () => setVoiding(v) },
                    ] })}><MoreHorizontal /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {data && data.total > 0 && (
        <div className="table-foot">
          <span>Showing {items.length} of {data.total} expense{data.total === 1 ? "" : "s"}</span>
          <div className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>)}
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
          </div>
        </div>
      )}
      <Menu anchor={menu?.anchor ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <ConfirmDialog open={!!voiding} onClose={() => setVoiding(null)} title={`Void ${voiding?.docNo ?? ""}?`} confirmLabel="Void" danger busy={busy} onConfirm={doVoid}>
        The voucher stays on record as void and is left out of the next top-up.
      </ConfirmDialog>
    </div>
  );
}

/** Template Spend by category: a stacked bar and its legend. */
export function SpendByCategory({ list }: { list: PettyVoucherList | null }) {
  const cats = list?.byCategory ?? [];
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const top = cats.slice(0, 5);
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>Spend by category</h3><p>Expense vouchers (not void)</p></div></div>
      {!list ? <Skeleton style={{ height: 40 }} /> : !total ? <small className="muted">No expenses yet.</small> : (
        <>
          <div className="stackbar mb">{top.map((c, i) => <i key={c.name} style={{ width: `${Math.max(2, Math.round((c.amount / total) * 100))}%`, background: STACK[i] }} />)}</div>
          <div className="legend" style={{ flexWrap: "wrap" }}>{top.map((c, i) => <span key={c.name}><i style={{ background: STACK[i] }} />{c.name} {Math.round((c.amount / total) * 100)}%</span>)}</div>
        </>
      )}
    </div>
  );
}

type ExpenseForm = { fundId: string; docDate: string; categoryId: string; amount: string; description: string; paidTo: string; receiptStatus: string; receiptCount: string };

/** Template acc-petty-expense: a small expense paid from a fund (create or edit an unreplenished voucher). Remount with a key to reset. */
export function PettyExpenseModal({ open, voucher, options, defaultFundId, onClose, onSaved }: {
  open: boolean;
  voucher: PettyVoucher | null;
  options: CashOptions | null;
  defaultFundId?: string;
  onClose: () => void;
  onSaved: (v: PettyVoucher) => void;
}) {
  const toast = useToast();
  const funds = (options?.pettyFunds ?? []).filter((f) => f.status !== "CLOSED");
  const [form, setForm] = useState<ExpenseForm | null>(() => voucher
    ? { fundId: voucher.fund.id, docDate: voucher.docDate, categoryId: voucher.category.id, amount: String(voucher.amount), description: voucher.description, paidTo: voucher.paidTo, receiptStatus: voucher.receiptStatus, receiptCount: String(voucher.receiptCount) }
    : { fundId: defaultFundId ?? funds[0]?.id ?? "", docDate: isoDay(new Date()), categoryId: options?.expenseCategories[0]?.id ?? "", amount: "", description: "", paidTo: "", receiptStatus: "ATTACHED", receiptCount: "1" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof ExpenseForm>(k: K, v: ExpenseForm[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const fund = funds.find((f) => f.id === form?.fundId);
  const available = fund ? fund.cashOnHand + (voucher && voucher.fund.id === fund.id ? voucher.amount : 0) : 0;
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const body = {
      fundId: form.fundId, docDate: form.docDate, categoryId: form.categoryId, amount: num(form.amount), description: form.description, paidTo: form.paidTo,
      receiptStatus: form.receiptStatus, receiptCount: form.receiptStatus === "ATTACHED" ? Number(form.receiptCount) || 0 : 0,
    };
    try {
      const v = voucher ? await updatePettyVoucher(voucher.id, { ...body, rowVersion: voucher.rowVersion }) : await createPettyVoucher(body);
      toast(voucher ? `${v.docNo} saved` : `Petty expense ${v.docNo} recorded`, { tone: "good" });
      onSaved(v);
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(e instanceof ApiError && e.code === "PETTY_FUND_SHORT" ? `${e.message}` : apiMessage(e, "Could not save the expense"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={voucher ? `Edit ${voucher.docNo}` : "Record petty expense"} subtitle="Small cash expense paid from a fund" foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || !form}>{busy ? "Saving…" : "Save expense"}</button>
      </>
    }>
      {form && (
        <>
          <FormGrid>
            <Field label="Fund" required error={errs.fundId} hint={fund ? `${rs(available)} in the fund` : undefined}>
              <select value={form.fundId} onChange={(e) => set("fundId", e.target.value)} disabled={!!voucher}>
                {!funds.length && <option value="">No open fund</option>}
                {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
            <Field label="Date" error={errs.docDate}><input type="date" value={form.docDate} onChange={(e) => set("docDate", e.target.value)} /></Field>
            <Field label="Category" required error={errs.categoryId}>
              <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">Choose…</option>
                {options?.expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.receiptRequired ? " · receipt needed" : ""}</option>)}
              </select>
            </Field>
            <Field label="Amount (Rs)" required error={errs.amount}><input inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
            <Field label="Description" required full error={errs.description}><input placeholder="What was purchased?" value={form.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Paid to" required full error={errs.paidTo}><input placeholder="Vendor or person" value={form.paidTo} onChange={(e) => set("paidTo", e.target.value)} /></Field>
            <Field label="Receipt" error={errs.receiptStatus}>
              <select value={form.receiptStatus} onChange={(e) => set("receiptStatus", e.target.value)}>
                <option value="ATTACHED">Held</option><option value="MISSING">Missing</option><option value="NA">Not applicable</option>
              </select>
            </Field>
            {form.receiptStatus === "ATTACHED" && <Field label="Receipts held" error={errs.receiptCount}><input inputMode="numeric" value={form.receiptCount} onChange={(e) => set("receiptCount", e.target.value)} /></Field>}
          </FormGrid>
          <div className="dropzone mt" aria-disabled style={{ opacity: 0.6, cursor: "default" }}><Camera /><b>Attach receipt photo</b><small>Receipt files arrive with document storage</small></div>
        </>
      )}
    </Modal>
  );
}

/** Template acc-petty-topup: replenish a fund to its imprest level from a cash or bank account. Remount with a key to reset. */
export function PettyTopupModal({ open, fund, options, onClose, onDone }: {
  open: boolean;
  fund: PettyFundOption | null;
  options: CashOptions | null;
  onClose: () => void;
  onDone: (r: PettyReplenishment) => void;
}) {
  const toast = useToast();
  const funds = (options?.pettyFunds ?? []).filter((f) => f.status !== "CLOSED");
  const [fundId, setFundIdRaw] = useState(() => fund?.id ?? funds[0]?.id ?? "");
  const [date, setDate] = useState(isoDay(new Date()));
  const [payFromEdit, setPayFrom] = useState<string | null>(null);
  const [amountEdit, setAmount] = useState<string | null>(null);
  const [together, setTogether] = useState(true);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const f = funds.find((x) => x.id === fundId);
  const setFundId = (id: string) => { setFundIdRaw(id); setAmount(null); setPayFrom(null); };
  // back up to the imprest level: what was spent from the box, at least the unreplenished vouchers
  const amount = amountEdit ?? (f ? String(Math.max(f.unreplenishedTotal, Math.round((f.imprestAmount - f.cashOnHand) * 100) / 100)) : "");
  const firstCash = options?.cashAccounts.find((c) => c.id !== f?.cashAccountId && c.kind !== "PETTY" && c.kind !== "IMPREST");
  const payFrom = payFromEdit ?? (firstCash ? `C:${firstCash.id}` : options?.bankAccounts[0] ? `B:${options.bankAccounts[0].id}` : "");

  const save = async () => {
    if (!f) return;
    setBusy(true);
    setErrs({});
    const [kind, id] = payFrom.split(":");
    try {
      const r = await replenishFund(f.id, { docDate: date, payFromCashAccountId: kind === "C" ? id : null, payFromBankAccountId: kind === "B" ? id : null, amount: num(amount), postTogether: together });
      toast(`${f.name} topped up · ${r.voucher?.docNo ?? "posted"}`, { tone: "good" });
      onDone(r);
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not top up the fund"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const cashAccounts = (options?.cashAccounts ?? []).filter((c) => c.id !== f?.cashAccountId);
  return (
    <Modal open={open} onClose={onClose} title="Top-up petty cash" subtitle="Replenish fund to its imprest level" foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || !f}>{busy ? "Posting…" : "Top-up"}</button>
      </>
    }>
      <FormGrid>
        <Field label="Fund" required>
          <select value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {!funds.length && <option value="">No open fund</option>}
            {funds.map((x) => <option key={x.id} value={x.id}>{x.name} — {rs(x.cashOnHand)} of {rs(x.imprestAmount)}</option>)}
          </select>
        </Field>
        <Field label="Date" error={errs.docDate}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Pay from" error={errs.payFromCashAccountId ?? errs.payFromBankAccountId}>
          <select value={payFrom} onChange={(e) => setPayFrom(e.target.value)}>
            {cashAccounts.length > 0 && <optgroup label="Cash">{cashAccounts.map((c) => <option key={c.id} value={`C:${c.id}`}>{c.name} — {rs(c.balance)}</option>)}</optgroup>}
            {(options?.bankAccounts.length ?? 0) > 0 && <optgroup label="Bank">{options!.bankAccounts.map((b) => <option key={b.id} value={`B:${b.id}`}>{b.title}{b.last4 ? ` — ${b.last4}` : ""}</option>)}</optgroup>}
          </select>
        </Field>
        <Field label="Amount (Rs)" required error={errs.amount}><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Replenish vouchers" full hint="Every unreplenished voucher of the fund up to the date is expensed by this top-up">
          <select disabled><option>{f ? `${f.unreplenishedCount} unreplenished voucher${f.unreplenishedCount === 1 ? "" : "s"} · ${rs(f.unreplenishedTotal)}` : "—"}</option></select>
        </Field>
        <Check full label="Post expense vouchers and CPV together" checked={together} onChange={(e) => setTogether(e.target.checked)} />
      </FormGrid>
    </Modal>
  );
}

/** Top-ups of the funds (latest first) with Cancel on posted ones. */
export function PettyTopups({ reloadKey, can, onChanged }: { reloadKey: number; can: { post: boolean }; onChanged: () => void }) {
  const toast = useToast();
  const [list, setList] = useState<PettyReplenishment[] | null>(null);
  const [cancel, setCancel] = useState<PettyReplenishment | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listReplenishments().then((l) => !cancelled && setList(l)).catch(() => !cancelled && setList([]));
    return () => { cancelled = true; };
  }, [reloadKey]);
  const shown = useMemo(() => (list ?? []).slice(0, 6), [list]);
  const run = async () => {
    if (!cancel) return;
    setBusy(true);
    try {
      await cancelReplenishment(cancel.id, cancel.rowVersion, "Cancelled from Petty Cash");
      toast("Top-up cancelled · its vouchers are unreplenished again", { tone: "good" });
      setCancel(null);
      onChanged();
    } catch (e) {
      toast(apiMessage(e, "Could not cancel the top-up"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>Top-ups</h3><p>Latest replenishments</p></div></div>
      {!list ? <Skeleton style={{ height: 80 }} /> : !shown.length ? <small className="muted">No top-ups yet.</small> : (
        <div className="list">
          {shown.map((r) => (
            <div key={r.id} className="row" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <div style={{ minWidth: 0 }}>
                <b>{r.fund.name}</b> · {rs(r.amount)}
                <small className="muted" style={{ display: "block" }}>{dateLabel(r.docDate)} · from {r.payFrom.name} · {r.voucherCount} voucher{r.voucherCount === 1 ? "" : "s"}{r.voucher ? ` · ${r.voucher.docNo}` : ""}</small>
              </div>
              <span className="spacer" />
              {r.status === "POSTED" && can.post ? <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button> : <Badge tone={r.status === "CANCELLED" ? "danger" : "good"}>{r.status === "CANCELLED" ? "Cancelled" : "Posted"}</Badge>}
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title="Cancel this top-up?" confirmLabel="Cancel top-up" danger busy={busy} onConfirm={run}>
        Its voucher is reversed and the expense vouchers it covered become unreplenished again.
      </ConfirmDialog>
    </div>
  );
}
