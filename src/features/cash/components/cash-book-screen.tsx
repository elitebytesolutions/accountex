"use client";

import "@/features/banking/components/bank-book.css";
import "./cash-books.css";
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, BookOpen, Building2, Calendar, CalendarRange, CircleCheck, Clock, CloudUpload, Coins, CreditCard,
  EllipsisVertical, FileText, Hash, Landmark, Lightbulb, LockKeyhole, LockKeyholeOpen, MessageSquareText, Minus, Plus, Save, Search, Tag, TrendingUp, Undo2,
  User, Users, Wallet, WalletCards, Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cashEntryErrors, ENTRY_PAYMENT_MODES, type CashBook, type CashLedger, type CashLedgerRow, type CashOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/overlay";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { cashBook, cashLedger, cashOptions, createCashEntry, reverseCashEntry } from "../api";
import { addDays, dMon, dow, errMsg, grp, MON, NOTES, r2, rs, today, useCashDay, useThumb, WDL, type Counts } from "./cash-ui";

type Mode = "cash" | "bank" | "transfer" | "cheque";
type Kind = "in" | "out";
type Form = { date: string; time: string; party: string; pick: string; cat: string; acct: string; mode: string; ref: string; chq: string; chqDate: string; drawn: string; pdc: boolean; amt: string; notes: string };
type TrForm = { from: string; to: string; date: string; ref: string; amt: string; notes: string };
const TIPS: Record<Mode, string> = {
  cash: "Posts a cash receipt (CRV) or payment (CPV).",
  bank: "Posts a bank receipt (BRV) or payment (BPV).",
  transfer: "Posts a contra voucher between accounts.",
  cheque: "Cheques clear from Cheques & PDC.",
};
const MODE_LABEL: Record<string, string> = { CASH: "Cash", CARD: "Card", IBFT: "IBFT", RAAST: "Raast", BANK_TRANSFER: "Bank transfer", DEBIT_CARD: "Debit card", CHEQUE: "Cheque" };
const KIND: Record<Mode, Record<Kind, string>> = {
  cash: { in: "CASH_IN", out: "CASH_OUT" }, bank: { in: "BANK_IN", out: "BANK_OUT" }, cheque: { in: "CHEQUE_IN", out: "CHEQUE_OUT" }, transfer: { in: "TRANSFER", out: "TRANSFER" },
};
const DEN_TONE: Record<number, string> = { 5000: "var(--warn)", 1000: "var(--blue)", 500: "var(--good)", 100: "var(--danger)", 50: "var(--violet)", 20: "var(--orange)", 10: "var(--primary)" };
const nowTime = () => new Date().toTimeString().slice(0, 5);
const blank = (acct: string, mode: string): Form => ({ date: today(), time: nowTime(), party: "", pick: "", cat: "", acct, mode, ref: "", chq: "", chqDate: today(), drawn: "", pdc: false, amt: "", notes: "" });
const parseAmt = (s: string) => { const n = Number(s.replace(/[,\s]/g, "")); return Number.isFinite(n) && n > 0 ? r2(n) : 0; };
const monthStart = () => `${today().slice(0, 8)}01`;

/** Template app/cash/book (47-books.html + 98-books.js): KPIs, quick entry (cash / bank / transfer / cheque), day-grouped ledger, cash count, today at a glance. */
export function CashBookScreen({ can }: { can: { create: boolean; post: boolean; approve: boolean } }) {
  const toast = useToast();
  const router = useRouter();
  const [options, setOptions] = useState<CashOptions | null>(null);
  const [bookToday, setBookToday] = useState<CashBook | null>(null);
  const [bookPeriod, setBookPeriod] = useState<CashBook | null>(null);
  const [ledger, setLedger] = useState<CashLedger | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drawer, setDrawer] = useState("");
  const [mode, setMode] = useState<Mode>("cash");
  const [forms, setForms] = useState<Record<Kind, Form>>({ in: blank("", "CASH"), out: blank("", "CASH") });
  const [tr, setTr] = useState<TrForm>({ from: "", to: "", date: today(), ref: "", amt: "", notes: "" });
  const [errs, setErrs] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [from, setFrom] = useState(() => addDays(today(), -6));
  const [to, setTo] = useState(today);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [reversing, setReversing] = useState<{ entryId: string; docNo: string } | null>(null);
  const [revBusy, setRevBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const pills = useRef<HTMLDivElement>(null);
  const seg = useRef<HTMLDivElement>(null);
  useThumb(pills, ".cb-thumb", mode);
  useThumb(seg, ".cb-seg-thumb", dir);

  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });
  const loadOptions = useCallback(() => cashOptions().then((o) => {
    setOptions(o);
    const main = o.cashAccounts.find((c) => c.kind !== "PETTY" && c.kind !== "IMPREST") ?? o.cashAccounts[0];
    setDrawer((d) => d || main?.id || "");
    setForms((f) => (f.in.acct ? f : { in: { ...f.in, acct: main?.id ?? "" }, out: { ...f.out, acct: main?.id ?? "" } }));
    setTr((t) => (t.from ? t : { ...t, from: main ? `cash:${main.id}` : "", to: o.bankAccounts[0] ? `bank:${o.bankAccounts[0].id}` : o.cashAccounts[1] ? `cash:${o.cashAccounts[1].id}` : "" }));
  }), []);
  useEffect(() => { loadOptions().catch((e: unknown) => fail(e, "Could not load cash accounts")); }, [loadOptions, attempt]);
  const loadBooks = useCallback(() => {
    if (!drawer) return Promise.resolve();
    return Promise.all([
      cashBook({ account: drawer, from: today(), to: today() }),
      cashBook({ account: drawer, from, to }),
      cashLedger({ account: drawer, from, to }),
    ]).then(([t, p, l]) => { setBookToday(t); setBookPeriod(p); setLedger(l); setError(null); });
  }, [drawer, from, to]);
  useEffect(() => { loadBooks()?.catch((e: unknown) => fail(e, "Could not load the cash book")); }, [loadBooks, attempt]);
  const refreshAll = useCallback(() => { void loadOptions(); void loadBooks(); }, [loadOptions, loadBooks]);

  const count = useCashDay(drawer, today(), refreshAll);
  const drawerAcct = options?.cashAccounts.find((c) => c.id === drawer) ?? null;

  // ---------------------------------------------------------------- quick entry
  const switchMode = (m: Mode) => {
    if (m === mode || !options) return;
    const bankish = m === "bank" || m === "cheque";
    setForms((f) => {
      const fix = (x: Form, k: Kind): Form => {
        const acctOk = bankish ? options.bankAccounts.some((b) => b.id === x.acct) : options.cashAccounts.some((c) => c.id === x.acct);
        const modes = ENTRY_PAYMENT_MODES[KIND[m][k]] ?? [];
        return { ...x, acct: acctOk ? x.acct : bankish ? (options.bankAccounts[0]?.id ?? "") : drawer, mode: modes.includes(x.mode) ? x.mode : (modes[0] ?? "") };
      };
      return { in: fix(f.in, "in"), out: fix(f.out, "out") };
    });
    setErrs({});
    setMode(m);
  };
  const setF = (k: Kind, patch: Partial<Form>) => { setForms((f) => ({ ...f, [k]: { ...f[k], ...patch } })); setErrs((e) => ({ ...e, [k]: {} })); };

  const saveEntry = async (k: Kind) => {
    if (!options) return;
    const f = forms[k], kind = KIND[mode][k], bankish = mode === "bank" || mode === "cheque";
    const cat = options.categories.find((c) => c.id === f.cat);
    const body = {
      kind, entryDate: f.date, entryTime: f.time || null, cashAccountId: bankish ? null : f.acct, bankAccountId: bankish ? f.acct : null, toCashAccountId: null, toBankAccountId: null,
      categoryId: f.cat || null, accountId: null, paymentMode: f.mode || null, partyName: f.party.trim() || null,
      customerId: k === "in" && f.pick ? f.pick : null, vendorId: k === "out" && f.pick ? f.pick : null, employeeId: null, referenceNo: f.ref.trim() || null,
      amount: parseAmt(f.amt), narration: f.notes.trim() || null, costCentreId: null,
      chequeNo: mode === "cheque" ? f.chq.trim() || null : null, chequeDate: mode === "cheque" ? f.chqDate || null : null, drawnOnBankId: mode === "cheque" && k === "in" ? f.drawn || null : null, chequeBookId: null, isPdc: mode === "cheque" && f.pdc,
    };
    const e = cashEntryErrors(body as Parameters<typeof cashEntryErrors>[0]);
    if (!body.amount) e.amount = "Enter an amount";
    if (cat && !cat.defaultAccountId) e.categoryId = "This category has no default account; set one in Cash Setup";
    if (k === "out" && !bankish && body.amount && drawerAcct && f.acct === drawerAcct.id && body.amount > drawerAcct.balance) e.amount = `Only ${rs(drawerAcct.balance)} in the drawer`;
    if (Object.keys(e).length) { setErrs((x) => ({ ...x, [k]: e })); return; }
    setSaving(k);
    try {
      const created = await createCashEntry(body);
      const v = created.voucher;
      toast(v?.status === "PENDING_APPROVAL" ? `${v.docNo} sent for approval · ${rs(body.amount)}` : `${v?.docNo ?? (created.cheque ? `Cheque ${created.cheque.chequeNo}` : "Entry")} posted · ${rs(body.amount)}`, { tone: "good" });
      setForms((x) => ({ ...x, [k]: { ...blank(f.acct, f.mode), date: f.date } }));
      refreshAll();
      void count.reload();
    } catch (err) {
      const d = err instanceof ApiError ? err.details : undefined;
      if (d) setErrs((x) => ({ ...x, [k]: Object.fromEntries(Object.entries(d).map(([kk, m]) => [kk, m[0] ?? ""])) }));
      toast(errMsg(err, "Could not save the entry"), { tone: "danger" });
    } finally {
      setSaving(null);
    }
  };

  const accountOf = (key: string) => {
    const [t, id] = key.split(":");
    if (t === "cash") { const c = options?.cashAccounts.find((x) => x.id === id); return c ? { name: c.name, sub: c.code, balance: c.balance, icon: Banknote } : null; }
    const b = options?.bankAccounts.find((x) => x.id === id);
    return b ? { name: b.title, sub: b.last4 ? `•••• ${b.last4}` : "Bank", balance: b.balance, icon: Landmark } : null;
  };
  const saveTransfer = async () => {
    const [ft, fid] = tr.from.split(":"), [tt, tid] = tr.to.split(":");
    const body = {
      kind: "TRANSFER", entryDate: tr.date, entryTime: nowTime(), cashAccountId: ft === "cash" ? fid : null, bankAccountId: ft === "bank" ? fid : null,
      toCashAccountId: tt === "cash" ? tid : null, toBankAccountId: tt === "bank" ? tid : null, categoryId: null, accountId: null, paymentMode: null, partyName: null,
      customerId: null, vendorId: null, employeeId: null, referenceNo: tr.ref.trim() || null, amount: parseAmt(tr.amt), narration: tr.notes.trim() || null, costCentreId: null,
      chequeNo: null, chequeDate: null, drawnOnBankId: null, chequeBookId: null, isPdc: false,
    };
    const e = cashEntryErrors(body as Parameters<typeof cashEntryErrors>[0]);
    if (!body.amount) e.amount = "Enter an amount";
    const src = accountOf(tr.from);
    if (ft === "cash" && src && body.amount > src.balance) e.from = `Only ${rs(src.balance)} available`;
    if (tr.from === tr.to) e.to = "From and to must differ";
    if (Object.keys(e).length) { setErrs((x) => ({ ...x, tr: { ...e, ...(e.cashAccountId && { from: e.cashAccountId }), ...(e.toCashAccountId && { to: e.toCashAccountId }) } })); return; }
    setSaving("tr");
    try {
      const created = await createCashEntry(body);
      toast(`${created.voucher?.docNo ?? "Transfer"} ${created.voucher?.status === "PENDING_APPROVAL" ? "sent for approval" : "posted"} · ${rs(body.amount)}`, { tone: "good" });
      setTr((t) => ({ ...t, ref: "", amt: "", notes: "" }));
      refreshAll();
    } catch (err) {
      toast(errMsg(err, "Could not save the transfer"), { tone: "danger" });
    } finally {
      setSaving(null);
    }
  };

  // ---------------------------------------------------------------- ledger
  const entryByVoucher = useMemo(() => new Map((bookPeriod?.entries ?? []).filter((e) => e.voucher).map((e) => [e.voucher!.id, e])), [bookPeriod]);
  const days = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...(ledger?.days ?? [])].reverse().map((d) => ({
      ...d,
      rows: d.rows.filter((r) => (dir === "all" || (dir === "in" ? r.receipt > 0 : r.payment > 0)) && (!s || [r.narration, r.particulars, r.voucher?.docNo, r.category, r.contra?.name].join(" ").toLowerCase().includes(s))),
    })).filter((d) => d.rows.length);
  }, [ledger, q, dir]);
  const shown = days.reduce((n, d) => n + d.rows.length, 0);
  const rowMenu = (r: CashLedgerRow): MenuItem[] => {
    const e = r.entryId ? { id: r.entryId } : r.voucher ? entryByVoucher.get(r.voucher.id) : undefined;
    return [
      ...(r.voucher ? [{ label: `View voucher ${r.voucher.docNo}`, icon: <FileText />, onClick: () => router.push(`/accounting/vouchers/${r.voucher!.id}`) }] : []),
      ...(e && can.post && r.voucher?.status === "POSTED" ? [{ sep: true as const }, { label: "Reverse entry", icon: <Undo2 />, danger: true, onClick: () => setReversing({ entryId: e.id, docNo: r.voucher!.docNo }) }] : []),
    ];
  };
  const doReverse = async () => {
    if (!reversing) return;
    setRevBusy(true);
    try {
      await reverseCashEntry(reversing.entryId, { date: today(), reason: "OTHER", remarks: "Reversed from the cash book" });
      toast(`${reversing.docNo} reversed`, { tone: "good" });
      setReversing(null);
      refreshAll();
    } catch (err) {
      toast(errMsg(err, "Could not reverse the entry"), { tone: "danger" });
    } finally {
      setRevBusy(false);
    }
  };

  if (error && !options) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;
  const k = bookToday?.kpis;
  const catsFor = (kind: Kind) => (options?.categories ?? []).filter((c) => c.direction === (kind === "in" ? "IN" : "OUT"));
  const bankish = mode === "bank" || mode === "cheque";

  const panel = (kind: Kind) => {
    const f = forms[kind], out = kind === "out", e = errs[kind] ?? {};
    const sub = { cash: out ? "Record money paid out from your business" : "Record money received into your business", bank: out ? "Record a payment made from your bank account" : "Record money received into your bank account", cheque: out ? "Issue a cheque to a vendor or for an expense" : "Receive a customer cheque into a bank account", transfer: "" }[mode];
    const parties = out ? options?.vendors ?? [] : options?.customers ?? [];
    const modes = ENTRY_PAYMENT_MODES[KIND[mode][kind]] ?? [];
    return (
      <form key={kind} className={cn("cb-panel", kind)} noValidate onSubmit={(ev) => { ev.preventDefault(); void saveEntry(kind); }}>
        <div className="cb-ph">
          <span className="cb-ph-icon">{out ? <ArrowUpFromLine /> : <ArrowDownToLine />}</span>
          <div><h2>{out ? "Cash Out" : "Cash In"}</h2><p>{sub}</p></div>
          <span className="cb-ph-badge">{out ? "Manage your expenses" : "Increase your cash flow"}</span>
        </div>
        <div className="cb-grid">
          <div className="cb-group-label first">When</div>
          <Fld label="Date" req icon={<Calendar />} err={e.entryDate}><input type="date" value={f.date} onChange={(x) => setF(kind, { date: x.target.value })} /></Fld>
          <Fld label="Time" req icon={<Clock />}><input type="time" value={f.time} onChange={(x) => setF(kind, { time: x.target.value })} /></Fld>
          <div className="cb-group-label">Who</div>
          <Fld label={out ? "Paid To / Party" : "Received From / Party"} req icon={<User />} full err={e.partyName}>
            <input value={f.party} onChange={(x) => setF(kind, { party: x.target.value })} placeholder={out ? "e.g. Daraz Business" : "Walk-in Customer"} autoComplete="off" />
          </Fld>
          <Fld label={out ? "Vendor" : "Customer"} hint="fills the party" icon={<Users />} full>
            <select className={cn(!f.pick && "ph")} value={f.pick} onChange={(x) => { const p = parties.find((y) => y.id === x.target.value); setF(kind, { pick: x.target.value, ...(p && { party: p.name }) }); }}>
              <option value="">{out ? "Select a vendor (optional)" : "Select a customer (optional)"}</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}
            </select>
          </Fld>
          <div className="cb-group-label">What</div>
          <Fld label="Category" req icon={<Tag />} err={e.categoryId ?? e.accountId}>
            <select className={cn(!f.cat && "ph")} value={f.cat} onChange={(x) => setF(kind, { cat: x.target.value })}>
              <option value="">Choose a category</option>
              {catsFor(kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Fld>
          <Fld label={bankish ? "Bank Account" : "Account"} req icon={bankish ? <Landmark /> : <WalletCards />} err={e.cashAccountId ?? e.bankAccountId}>
            <select value={f.acct} onChange={(x) => setF(kind, { acct: x.target.value })}>
              {bankish
                ? options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}{b.last4 ? ` · ${b.last4}` : ""}</option>)
                : options?.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}
            </select>
          </Fld>
          <Fld label="Payment Mode" req icon={<CreditCard />} err={e.paymentMode}>
            <select value={f.mode} onChange={(x) => setF(kind, { mode: x.target.value })}>{modes.map((m) => <option key={m} value={m}>{MODE_LABEL[m] ?? m}</option>)}</select>
          </Fld>
          <Fld label="Reference No." icon={<FileText />}><input value={f.ref} onChange={(x) => setF(kind, { ref: x.target.value })} placeholder={out ? "e.g. BILL-2026-000214" : "e.g. INV-2026-000123"} /></Fld>
          {mode === "cheque" && (
            <div className="cb-chq enter"><div className="cb-chq-in">
              <div className="cb-group-label">Cheque</div>
              <Fld label="Cheque No." req icon={<Hash />} err={e.chequeNo}><input value={f.chq} onChange={(x) => setF(kind, { chq: x.target.value })} placeholder="e.g. 004419" inputMode="numeric" /></Fld>
              <Fld label="Cheque Date" req icon={<Calendar />} err={e.chequeDate}><input type="date" value={f.chqDate} onChange={(x) => setF(kind, { chqDate: x.target.value })} /></Fld>
              {!out ? (
                <Fld label="Drawn On Bank" icon={<Building2 />}>
                  <select className={cn(!f.drawn && "ph")} value={f.drawn} onChange={(x) => setF(kind, { drawn: x.target.value })}><option value="">Choose the bank</option>{options?.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                </Fld>
              ) : <span />}
              <div className="cb-f cb-pdc"><span className="cb-l">Post-dated?</span>
                <label className="cb-toggle"><input type="checkbox" checked={f.pdc} onChange={(x) => setF(kind, { pdc: x.target.checked })} /><i /><span><b>PDC</b><small>Hold until cheque date</small></span></label>
              </div>
            </div></div>
          )}
          <div className="cb-group-label">Amount</div>
          <Fld label="Amount" req full cls="amount-f" well={<b className="cb-rs">Rs</b>} err={e.amount}>
            <input type="text" inputMode="decimal" value={f.amt} onChange={(x) => setF(kind, { amt: x.target.value })} placeholder="0.00" autoComplete="off" />
          </Fld>
          <div className="cb-group-label">Notes</div>
          <Fld label="Notes / Narration" icon={<MessageSquareText />} full>
            <input value={f.notes} onChange={(x) => setF(kind, { notes: x.target.value })} placeholder={out ? "e.g. Office supplies purchase, bill no., etc." : "e.g. Payment for invoice, customer name, etc."} />
          </Fld>
        </div>
        <div className="cb-attach"><span className="cb-l">Receipt / Attachment</span>
          <span className="cb-drop" aria-disabled="true" style={{ opacity: 0.6, cursor: "not-allowed" }}>
            <span className="cb-drop-icon"><CloudUpload /></span>
            <span className="cb-drop-body"><b>Attachments arrive with document storage</b><small>Keep the receipt number in Reference No. for now</small></span>
          </span>
        </div>
        <button className="cb-save" type="submit" disabled={!can.create || saving === kind}><Save />{saving === kind ? "Saving…" : out ? "Save Cash Out" : "Save Cash In"}</button>
      </form>
    );
  };

  const trCard = (side: "from" | "to") => {
    const a = accountOf(tr[side]), amt = parseAmt(tr.amt), after = a ? a.balance + (side === "from" ? -amt : amt) : 0;
    const Icon = a?.icon ?? Wallet;
    const e = errs.tr?.[side];
    return (
      <div className={cn("cb-tr-card", side, e && "err")}>
        <span className="cb-tr-k">{side === "from" ? "From account" : "To account"}</span>
        <div className="cb-tr-sel"><span className="cb-tr-ic"><Icon /></span>
          <select value={tr[side]} onChange={(x) => { setTr((t) => ({ ...t, [side]: x.target.value })); setErrs((z) => ({ ...z, tr: {} })); }} aria-label={side === "from" ? "From account" : "To account"}>
            <optgroup label="Cash">{options?.cashAccounts.map((c) => <option key={c.id} value={`cash:${c.id}`}>{c.name} · {c.code}</option>)}</optgroup>
            <optgroup label="Bank">{options?.bankAccounts.map((b) => <option key={b.id} value={`bank:${b.id}`}>{b.title}{b.last4 ? ` · ${b.last4}` : ""}</option>)}</optgroup>
          </select>
        </div>
        <div className="cb-tr-bal"><span>Available</span><b>{a ? <Money value={a.balance} dec={0} /> : "—"}</b></div>
        <div className={cn("cb-tr-bal after", amt > 0 && "on")}><span>After transfer</span><b className={cn(after < 0 && "neg")}>{a ? rs(after) : "—"}</b></div>
        <small className="cb-err" aria-live="polite">{e}</small>
      </div>
    );
  };

  const c = count;
  const pct = Math.min(50, (Math.abs(c.variance) / Math.max(1, drawerAcct?.varianceTolerance || 1000)) * 50);

  return (
    <div className="cb-page cb-enter">
      <header className="cb-head">
        <div><h1>Cash Book Entry</h1><p>Record cash movement quickly and keep your books up to date</p></div>
        <span className="cb-tag" aria-hidden="true">Simple Accounting<br />for a Brighter Tomorrow.</span>
      </header>
      <div className="cb-kpis">
        <article className="main"><span className="cb-kic"><Wallet /></span><div><small>Total Liquid Cash</small><b>{k ? <Money value={k.liquid} /> : "—"}</b><em><TrendingUp />Cash and bank, today</em></div><i className="cb-bars" aria-hidden="true"><u /><u /><u /></i></article>
        <article><span className="cb-kic g"><Banknote /></span><div><small>Main Cash Drawer</small><b>{k?.mainDrawer ? <Money value={k.mainDrawer.balance} /> : "—"}</b><em>{k?.mainDrawer?.name ?? "No cash drawer yet"}</em></div></article>
        <article><span className="cb-kic b"><Landmark /></span><div><small>Bank Account</small><b>{k ? <Money value={k.bank} /> : "—"}</b><em>{k ? `${k.bankCount} account${k.bankCount === 1 ? "" : "s"}` : ""}</em></div></article>
        <article><span className="cb-kic y"><Coins /></span><div><small>Petty Cash</small><b>{k ? <Money value={k.petty} /> : "—"}</b><em>{k ? `Imprest ${rs(k.pettyImprest)}` : ""}</em></div></article>
      </div>
      <div className="cb-quick">
        <b>Quick Entry:</b>
        <div className="cb-pills" role="tablist" aria-label="Quick entry mode" ref={pills}>
          <span className="cb-thumb" aria-hidden="true" />
          {([["cash", "Cash Only", Banknote], ["bank", "Bank Only", Landmark], ["transfer", "Transfer", ArrowLeftRight], ["cheque", "Cheque", WalletCards]] as const).map(([m, l, Icon]) => (
            <button key={m} type="button" role="tab" className={cn(mode === m && "active")} aria-selected={mode === m} onClick={() => switchMode(m)}><Icon />{l}</button>
          ))}
        </div>
        <span className="cb-tip"><span className="cb-tip-ic"><Lightbulb /></span><b>Tip:</b><span data-tip>{TIPS[mode]}</span></span>
      </div>
      <div className={cn("cb-panels", mode === "transfer" && "one")}>
        {!can.create ? (
          <div className="cb-panel"><p className="muted" style={{ margin: 0 }}>You can view the cash book; recording entries needs the cash create permission.</p></div>
        ) : mode === "transfer" ? (
          <form className="cb-panel tr" noValidate onSubmit={(ev) => { ev.preventDefault(); void saveTransfer(); }}>
            <div className="cb-ph">
              <span className="cb-ph-icon"><ArrowLeftRight /></span>
              <div><h2>Transfer between accounts</h2><p>Move money between cash drawers and bank accounts. Posts a contra voucher.</p></div>
              <span className="cb-ph-badge">Contra entry · CON</span>
            </div>
            <div className="cb-tr-flow">
              {trCard("from")}
              <div className="cb-tr-mid"><span className="cb-tr-line" /><button type="button" className="cb-swap" aria-label="Swap accounts" title="Swap accounts" onClick={() => setTr((t) => ({ ...t, from: t.to, to: t.from }))}><ArrowLeftRight /></button><span className="cb-tr-line" /></div>
              {trCard("to")}
            </div>
            <div className="cb-grid c4">
              <Fld label="Date" req icon={<Calendar />}><input type="date" value={tr.date} onChange={(x) => setTr((t) => ({ ...t, date: x.target.value }))} /></Fld>
              <Fld label="Reference No." icon={<Hash />}><input value={tr.ref} onChange={(x) => setTr((t) => ({ ...t, ref: x.target.value }))} placeholder="e.g. Deposit slip 55102" /></Fld>
              <Fld label="Amount" req cls="amount-f span2" well={<b className="cb-rs">Rs</b>} err={errs.tr?.amount}><input type="text" inputMode="decimal" value={tr.amt} onChange={(x) => { setTr((t) => ({ ...t, amt: x.target.value })); setErrs((z) => ({ ...z, tr: {} })); }} placeholder="0.00" autoComplete="off" /></Fld>
              <Fld label="Narration" icon={<MessageSquareText />} full><input value={tr.notes} onChange={(x) => setTr((t) => ({ ...t, notes: x.target.value }))} placeholder="e.g. Cash deposited to the bank for vendor payments" /></Fld>
            </div>
            <button className="cb-save" type="submit" disabled={saving === "tr"}><ArrowLeftRight />{saving === "tr" ? "Saving…" : "Save Transfer"}</button>
          </form>
        ) : (<>{panel("in")}{panel("out")}</>)}
      </div>
      <div className="cb-lower">
        <section className="cb-ledger">
          <div className="cb-lh">
            <div className="cb-lh-t"><span className="cb-lh-ic"><BookOpen /></span><div>
              <h3>Cash Ledger · <select value={drawer} onChange={(x) => setDrawer(x.target.value)} aria-label="Cash account" style={{ display: "inline", width: "auto", height: "auto", minHeight: 0, appearance: "none", border: 0, boxShadow: "none", background: "transparent", font: "inherit", color: "inherit", padding: 0, cursor: "pointer" }}>{options?.cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></h3>
              <p>{dMon(from)} – {dMon(to)} · {shown} of {ledger?.count ?? 0} vouchers</p></div></div>
            <div className="cb-ltools">
              <label className="cb-search"><Search /><input type="search" value={q} onChange={(x) => setQ(x.target.value)} placeholder="Search voucher, party, category…" aria-label="Search ledger" /></label>
              <div className="cb-seg" role="tablist" aria-label="Direction" ref={seg}><span className="cb-seg-thumb" aria-hidden="true" />
                {(["all", "in", "out"] as const).map((d) => <button key={d} type="button" className={cn(dir === d && "active")} onClick={() => setDir(d)}>{d === "all" ? "All" : d === "in" ? "In" : "Out"}</button>)}
              </div>
              <div className="cb-range"><CalendarRange /><input type="date" value={from} max={to} onChange={(x) => x.target.value && setFrom(x.target.value)} aria-label="From date" /><span>→</span><input type="date" value={to} min={from} onChange={(x) => x.target.value && setTo(x.target.value)} aria-label="To date" /></div>
            </div>
          </div>
          <div className="bb-colhead"><span>Transaction</span><span>Receipt (+)</span><span>Payment (−)</span><span>Running balance</span><span>Status</span></div>
          <div className="bb-ledger">
            {!ledger ? <div className="cb-boot"><span /><span /><span /></div>
              : !days.length ? (
                <div className="bb-empty"><span className="bb-empty-ic"><Search /></span><b>No entries match</b><p>Try clearing the search or widening the date range.</p>
                  <button type="button" className="btn secondary sm" onClick={() => { setQ(""); setDir("all"); setFrom(monthStart()); }}>Clear filters</button></div>
              ) : (<>
                {days.map((d, i) => {
                  const dd = new Date(`${d.date}T00:00:00`);
                  const inT = d.rows.reduce((s, r) => s + r.receipt, 0), outT = d.rows.reduce((s, r) => s + r.payment, 0);
                  return (
                    <div key={d.date} className="bb-day" style={{ ["--d" as string]: i }}>
                      <div className="bb-daycol">
                        <div className={cn("bb-date", d.date === today() && "today")}><b>{String(dd.getDate()).padStart(2, "0")}</b><span>{MON[dd.getMonth()]} {dd.getFullYear()}</span><small>{d.date === today() ? "Today" : WDL[dd.getDay()]}</small></div>
                        {i === 0 && <div className="bb-open-chip"><small>Opening Balance</small><b><Money value={ledger.opening} /></b></div>}
                      </div>
                      <span className={cn("bb-node", i === days.length - 1 && "pulse")} />
                      <div className="bb-daycard">
                        {d.rows.map((r, j) => {
                          const isIn = r.receipt > 0;
                          const st = r.voucher?.status === "REVERSED" ? "draft" : r.voucher?.status === "PENDING_APPROVAL" ? "pending" : "posted";
                          return (
                            <div key={`${r.voucher?.id ?? j}-${j}`} className="bb-row">
                              <span className={cn("bb-row-icon", isIn ? "green" : "red")}>{isIn ? <ArrowDownToLine /> : <ArrowUpFromLine />}</span>
                              <div className="bb-row-text"><b title={r.narration ?? r.particulars}>{r.category ?? r.narration ?? r.particulars}</b><small>{[r.voucher?.docNo, r.contra?.name ?? r.particulars, r.narration && r.category ? r.narration : null].filter(Boolean).join(" · ")}</small></div>
                              <div className="bb-col">{isIn ? <b className="green">+<Money value={r.receipt} /></b> : <b className="dash">—</b>}</div>
                              <div className="bb-col">{!isIn ? <b className="red">−<Money value={r.payment} /></b> : <b className="dash">—</b>}</div>
                              <div className="bb-col bal"><small>Running Balance</small><b><Money value={r.balance} /></b></div>
                              <div className="bb-tag-slot"><span className={cn("bb-tag", st)}>{r.voucher?.status === "REVERSED" ? "Reversed" : r.voucher?.status === "PENDING_APPROVAL" ? "Pending" : "Posted"}</span></div>
                              <button type="button" className="bb-more" aria-label={`Actions for ${r.voucher?.docNo ?? "entry"}`} onClick={(ev) => setMenu({ anchor: ev.currentTarget, items: rowMenu(r) })}><EllipsisVertical /></button>
                            </div>
                          );
                        })}
                        <div className="cb-daytot"><span className="lbl">Day total{d.close?.status === "LOCKED" && " · closed"}</span>
                          <span>In <b className="green">+<Money value={inT} /></b></span>
                          <span>Out <b className="red">−<Money value={outT} /></b></span>
                          <span>Net <b className={inT - outT >= 0 ? "green" : "red"}>{inT - outT >= 0 ? "+" : "−"}<Money value={inT - outT} /></b></span>
                          <span className="close">Day close <b><Money value={d.closing} /></b></span></div>
                      </div>
                    </div>
                  );
                })}
                <div className="bb-day bb-closing" style={{ ["--d" as string]: days.length }}><div className="bb-daycol" /><span className="bb-node end" />
                  <div className="cb-closebar"><span><CircleCheck />Closing balance · {dMon(to)}</span><b><Money value={ledger.closing} /></b></div></div>
              </>)}
          </div>
        </section>
        <aside className="cb-rail">
          <div className="cb-card cb-cc">
            <div className="cb-card-h"><span className="cb-card-ic"><Coins /></span><div><h3>Cash Count</h3><p>{drawerAcct?.name ?? "Cash drawer"} · {dMon(today())}{c.locked ? " · closed" : ""}</p></div></div>
            <div className="cb-den">
              {NOTES.map((n) => <DenRow key={n} label={grp(n)} tone={DEN_TONE[n]!} value={c.counts[n] || 0} sub={n * (c.counts[n] || 0)} disabled={c.locked || !can.create} onChange={(v) => c.setCount(n, v)} />)}
              <DenRow coin label="Coins" tone="var(--muted)" value={c.counts.coins || 0} sub={c.counts.coins || 0} disabled={c.locked || !can.create} onChange={(v) => c.setCount("coins", v)} />
            </div>
            <div className="cb-cc-sum">
              <div><span>Counted</span><b><Money value={c.counted} /></b></div>
              <div><span>Book balance</span><b><Money value={c.book} /></b></div>
              <div className="os"><span>Over / Short</span><b className={c.variance === 0 ? "zero" : c.variance > 0 ? "over" : "short"}>{c.variance === 0 ? <><CircleCheck />Balanced</> : rs(c.variance, true)}</b></div>
            </div>
            <div className="cb-os-track" aria-hidden="true"><span className="lbl l">Short</span>
              <i className={c.variance >= 0 ? "over" : "short"} style={{ width: `${c.variance === 0 ? 0 : Math.max(2.5, pct)}%`, left: c.variance >= 0 ? "50%" : `${50 - Math.max(2.5, pct)}%` }} />
              <span className="mid" /><span className="lbl r">Over</span></div>
            {c.locked ? (
              <>
                <button type="button" className="cb-close-day done" disabled><LockKeyhole /><span>Day closed · {dMon(today())}{c.day?.lockedBy ? ` by ${c.day.lockedBy.name}` : ""}</span></button>
                {can.approve && <button type="button" className="btn secondary sm" style={{ marginTop: 8, width: "100%" }} disabled={c.busy} onClick={() => void c.reopen()}><LockKeyholeOpen />Reopen day</button>}
              </>
            ) : (
              <>
                {can.create && c.dirty && <button type="button" className="btn secondary sm" style={{ marginTop: 10, width: "100%" }} disabled={c.busy} onClick={() => void c.save()}><Save />Save count</button>}
                <button type="button" className="cb-close-day" disabled={!can.post || c.busy || !drawer} onClick={() => (c.variance !== 0 ? setConfirmClose(true) : void c.lock())}><CircleCheck /><span>{c.busy ? "Working…" : "Reconcile & close day"}</span></button>
                {Math.abs(c.variance) > (drawerAcct?.varianceTolerance ?? 0) && !can.approve && <p className="muted" style={{ fontSize: 11.5, margin: "8px 0 0" }}>Beyond the {rs(drawerAcct?.varianceTolerance ?? 0)} tolerance: someone with cash approval must close this day.</p>}
              </>
            )}
            {c.error && <p className="muted" style={{ fontSize: 11.5, margin: "8px 0 0" }}>{c.error}</p>}
          </div>
          <Glance book={bookToday} />
        </aside>
      </div>
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <ConfirmDialog open={!!reversing} onClose={() => setReversing(null)} onConfirm={() => void doReverse()} busy={revBusy} danger title={`Reverse ${reversing?.docNo ?? ""}?`} confirmLabel="Reverse entry">
        A reversal voucher dated today undoes the entry. The original stays in the books for the audit trail.
      </ConfirmDialog>
      <ConfirmDialog open={confirmClose} onClose={() => setConfirmClose(false)} onConfirm={() => { setConfirmClose(false); void c.lock(); }} title={`Close ${dMon(today())} with ${c.variance < 0 ? "a short" : "an over"} of ${rs(Math.abs(c.variance))}?`} confirmLabel="Close day">
        A variance journal for {rs(Math.abs(c.variance))} is posted to Cash over / short and the day becomes read-only.
      </ConfirmDialog>
    </div>
  );
}

function Fld({ label, req, hint, icon, well, full, cls, err, children }: { label: string; req?: boolean; hint?: string; icon?: ReactNode; well?: ReactNode; full?: boolean; cls?: string; err?: string; children: ReactNode }) {
  return (
    <label className={cn("cb-f", full && "full", cls, err && "err")}>
      <span className="cb-l">{label}{req && <em>*</em>}{hint && <small>{hint}</small>}</span>
      <span className="cb-in"><span className="cb-well">{well ?? icon}</span>{children}</span>
      <small className="cb-err" aria-live="polite">{err}</small>
    </label>
  );
}

function DenRow({ label, tone, value, sub, coin, disabled, onChange }: { label: string; tone: string; value: number; sub: number; coin?: boolean; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <div className="cb-den-row">
      <span className={cn("cb-note", coin && "coin")} style={{ ["--c" as string]: tone }}>{coin ? <Coins /> : <em>Rs</em>}{label}</span>
      <span className="cb-step">
        <button type="button" disabled={disabled} aria-label={`Fewer ${label}`} onClick={() => onChange(value - 1)}><Minus /></button>
        <input type="text" inputMode="numeric" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")))} aria-label={coin ? "Coins total in rupees" : `Count of Rs ${label} notes`} />
        <button type="button" disabled={disabled} aria-label={`More ${label}`} onClick={() => onChange(value + 1)}><Plus /></button>
      </span>
      <b className="cb-den-sub">{grp(sub)}</b>
    </div>
  );
}

function Glance({ book }: { book: CashBook | null }) {
  const g = book?.glance;
  const inT = g?.cashIn ?? 0, outT = g?.cashOut ?? 0, tot = inT + outT || 1, C = 2 * Math.PI * 42, a = (inT / tot) * C, gap = inT && outT ? 3 : 0;
  const ins = book?.entries.filter((e) => e.kind.endsWith("_IN")).length ?? 0, outs = book?.entries.filter((e) => e.kind.endsWith("_OUT")).length ?? 0;
  const max = g?.topCategories[0]?.amount || 1;
  const t = today();
  return (
    <div className="cb-card cb-glance">
      <div className="cb-card-h"><span className="cb-card-ic v"><Zap /></span><div><h3>Today at a glance</h3><p>{WDL[dow(t)]}, {dMon(t)} · cash book</p></div></div>
      <div className="cb-glance-top">
        <div className="cb-donut"><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="trk" cx="50" cy="50" r="42" />
          <circle className="seg in" cx="50" cy="50" r="42" strokeDasharray={`${Math.max(0, a - gap)} ${C}`} />
          <circle className="seg out" cx="50" cy="50" r="42" strokeDasharray={`${Math.max(0, C - a - gap)} ${C}`} strokeDashoffset={-a} /></svg>
          <div className="cb-donut-c"><small>Net</small><b className={inT - outT >= 0 ? "green" : "red"}>{inT - outT >= 0 ? "+" : "−"}{grp(Math.abs(inT - outT) / 1000, 1)}k</b></div></div>
        <div className="cb-legend">
          <div><i className="in" /><span>Cash in<small>{ins} entr{ins === 1 ? "y" : "ies"}</small></span><b><Money value={inT} dec={0} /></b></div>
          <div><i className="out" /><span>Cash out<small>{outs} entr{outs === 1 ? "y" : "ies"}</small></span><b><Money value={outT} dec={0} /></b></div>
        </div>
      </div>
      <div className="cb-cats"><h4>Top categories</h4>
        {g?.topCategories.length ? g.topCategories.slice(0, 4).map((c) => (
          <div key={c.name} className={cn("cb-cat", c.direction === "IN" ? "in" : "out")}><span className="cb-cat-ic">{c.direction === "IN" ? <ArrowDownToLine /> : <ArrowUpFromLine />}</span>
            <div><span><b>{c.name}</b><em>{c.direction === "IN" ? "+" : "−"}{grp(c.amount)}</em></span><i><u className="on" style={{ ["--w" as string]: `${((c.amount / max) * 100).toFixed(1)}%` }} /></i></div></div>
        )) : <p className="cb-none">No cash book entries yet today.</p>}
      </div>
    </div>
  );
}

export type { Counts };
