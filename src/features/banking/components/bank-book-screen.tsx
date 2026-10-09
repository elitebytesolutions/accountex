"use client";

import "./bank-book.css";
import {
  AlertTriangle, ArrowDown, ArrowDownToLine, ArrowLeftRight, ArrowUp, Banknote, BookOpen, CalendarRange, ChevronDown, ChevronRight, CircleCheck, Database, Download,
  EllipsisVertical, FileText, Info, Landmark, Leaf, Lightbulb, Printer, Receipt, RefreshCw, Search, Wallet, WalletCards, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BankBook, BankingOptions, BankTxn } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, isoDay, Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { bankBook, bankingOptions } from "../api";
import { CATEGORY_LABEL } from "./bank-ui";

type Row = BankTxn & { balance: number };
type Range = { l: string; from: string; to: string };
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HINTS = ["cheque", "deposit", "transfer", "charges", "pending"];

function ranges(): Range[] {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  const r = (l: string, a: Date, b: Date) => ({ l, from: isoDay(a), to: isoDay(b) });
  return [
    r("This month", new Date(y, m, 1), new Date(y, m + 1, 0)),
    r("Last month", new Date(y, m - 1, 1), new Date(y, m, 0)),
    r("Last 3 months", new Date(y, m - 2, 1), new Date(y, m + 1, 0)),
    r("Year to date", new Date(y, 0, 1), n),
    r("Last 12 months", new Date(y, m - 11, 1), new Date(y, m + 1, 0)),
  ];
}
const parts = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return { d: String(d.getDate()).padStart(2, "0"), my: `${MON[d.getMonth()]} ${d.getFullYear()}`, wd: WD[d.getDay()]! }; };
const short = (iso: string) => { const p = parts(iso); return `${p.d} ${p.my}`; };

/** Icon and tone per transaction (template BB_ICON: cheque, deposit, transfer, receipt, charges, tax). */
function kind(t: Row): { icon: LucideIcon; tone: string; title: string } {
  const out = t.withdrawal > 0;
  if (t.category === "BANK_CHARGES" || t.category === "MARKUP_EXPENSE") return { icon: Landmark, tone: "red", title: CATEGORY_LABEL[t.category]! };
  if (t.category === "TAX_PAYMENT") return { icon: Receipt, tone: "red", title: "Tax payment" };
  if (t.category === "TRANSFER") return { icon: ArrowLeftRight, tone: out ? "red" : "green", title: out ? "Transfer out" : "Transfer in" };
  if (t.cheque || t.paymentMode === "CHEQUE") return { icon: WalletCards, tone: out ? "red" : "green", title: out ? "Cheque issued" : "Cheque deposited" };
  if (t.paymentMode === "IBFT" || t.paymentMode === "RAAST" || t.paymentMode === "BANK_TRANSFER") return { icon: ArrowLeftRight, tone: out ? "red" : "green", title: out ? "Online transfer" : "Transfer received" };
  if (t.paymentMode === "CASH") return { icon: ArrowDownToLine, tone: "green", title: "Cash deposit" };
  return out ? { icon: Receipt, tone: "red", title: "Payment" } : { icon: Banknote, tone: "green", title: "Receipt" };
}
const tag = (s: string) => (s === "CLEARED" || s === "RECONCILED" ? "cleared" : s === "UNPRESENTED" || s === "UNCLEARED" ? "uncleared" : "pending");
const tagLabel: Record<string, string> = { CLEARED: "Cleared", RECONCILED: "Reconciled", UNPRESENTED: "Unpresented", UNCLEARED: "Uncleared", PENDING: "Pending", UNCATEGORISED: "Uncategorised" };

/** Template app/bank/book (47-books.html + 98-books.js): account, period, running-balance day timeline, reconciliation rail. */
export function BankBookScreen() {
  const toast = useToast();
  const router = useRouter();
  const [RANGES] = useState(ranges);
  const [options, setOptions] = useState<BankingOptions | null>(null);
  const [account, setAccount] = useState("");
  const [range, setRange] = useState(0);
  const [book, setBook] = useState<BankBook | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"pending" | "unresolved" | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    bankingOptions().then((o) => { setOptions(o); setAccount((a) => a || o.bankAccounts.find((b) => b.status === "ACTIVE")?.id || o.bankAccounts[0]?.id || ""); }).catch((e: unknown) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load bank accounts" }));
  }, []);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    const r = RANGES[range]!;
    bankBook({ account, from: r.from, to: r.to })
      .then((b) => { if (!cancelled) { setBook(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the bank book" }));
    return () => { cancelled = true; };
  }, [account, range, RANGES, attempt]);

  const R = RANGES[range]!;
  const acct = options?.bankAccounts.find((b) => b.id === account) ?? null;
  const rows = useMemo(() => (book?.rows ?? []) as Row[], [book]);
  const vis = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (only === "pending" && r.status !== "UNPRESENTED") return false;
      if (only === "unresolved" && !(r.status === "UNCLEARED" || r.status === "PENDING")) return false;
      if (!s) return true;
      const k = kind(r);
      return [r.description, r.detail, r.reference, r.voucher?.docNo, r.cheque?.chequeNo, k.title, tagLabel[r.status]].join(" ").toLowerCase().includes(s);
    });
  }, [rows, q, only]);
  const days = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of vis) map.set(r.txnDate, [...(map.get(r.txnDate) ?? []), r]);
    const showOpen = !q.trim() && !only;
    if (showOpen && !map.has(R.from)) return [[R.from, [] as Row[]] as const, ...map.entries()];
    return [...map.entries()];
  }, [vis, q, only, R.from]);
  const showOpen = !q.trim() && !only;

  if (error && !book) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;
  const wd = rows.filter((r) => r.withdrawal > 0), dp = rows.filter((r) => r.deposit > 0);
  const matched = rows.filter((r) => r.status === "CLEARED" || r.status === "RECONCILED").length;
  const pct = rows.length ? Math.round((matched / rows.length) * 100) : 100;
  const pend = rows.filter((r) => r.status === "UNPRESENTED").length;
  const unres = rows.filter((r) => r.status === "UNCLEARED" || r.status === "PENDING").length;
  const stmtBal = acct?.lastStatementBalance ?? null;
  const reconTo = acct?.reconciledTo ?? null;
  const upToDate = !!reconTo && !!book && reconTo >= book.to;

  const exportMenu = (anchor: HTMLElement) => setMenu({
    anchor,
    items: [
      { label: "Export as Excel (CSV)", icon: <Download />, onClick: () => {
        if (!book) return;
        downloadCsv(`bank-book-${acct?.last4 ?? "account"}-${book.from}-${book.to}.csv`, [
          ["Date", "Description", "Detail", "Voucher", "Cheque / Ref", "Withdrawal", "Deposit", "Running balance", "Status"],
          [book.from, "Opening balance", null, null, null, null, null, book.opening.toFixed(2), null],
          ...rows.map((r) => [r.txnDate, r.description, r.detail, r.voucher?.docNo ?? null, r.cheque?.chequeNo ?? r.reference, r.withdrawal ? r.withdrawal.toFixed(2) : null, r.deposit ? r.deposit.toFixed(2) : null, r.balance.toFixed(2), tagLabel[r.status] ?? r.status]),
          [book.to, "Closing balance", null, null, null, book.withdrawals.toFixed(2), book.deposits.toFixed(2), book.closing.toFixed(2), null],
        ]);
        toast(`Bank Book exported · ${rows.length} transactions`, { tone: "good" });
      } },
      { label: "Print / PDF", icon: <Printer />, onClick: () => window.print() },
    ],
  });
  const rowMenu = (r: Row): MenuItem[] => [
    ...(r.voucher ? [{ label: `Open ${r.voucher.docNo}`, icon: <FileText />, onClick: () => router.push(`/accounting/vouchers/${r.voucher!.id}`) }] : []),
    { label: "Bank transactions", icon: <ArrowLeftRight />, onClick: () => router.push("/bank/transactions") },
    { sep: true },
    { label: "Open reconciliation", icon: <RefreshCw />, onClick: () => router.push("/bank/reconciliation") },
  ];

  return (
    <div className="bb-page">
      <header className="bb-head">
        <span className="bb-logo"><BookOpen /></span>
        <div><h1>Bank Book</h1><p>Track and review your bank transactions with running balance</p></div>
        <span className="bb-quote"><Leaf /><em>“Clear books. Confident business.”</em></span>
      </header>
      <div className="bb-grid">
        <section className="bb-main">
          <div className="bb-tools">
            <label className="bb-acct"><span>Bank Account</span>
              <span className="bb-acct-box">
                <span className="bb-acct-ic"><Landmark /></span>
                <select value={account} onChange={(e) => { setAccount(e.target.value); setOnly(null); }} aria-label="Bank account">
                  {!options && <option>Loading…</option>}
                  {options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName ? `${b.bankName} - ` : ""}{b.title}</option>)}
                </select>
                <small>{acct ? `PKR • ${acct.last4 ? `•••• ${acct.last4}` : acct.title}${book?.bankAccount.glCode ? ` · GL ${book.bankAccount.glCode}` : ""}` : ""}</small>
              </span>
            </label>
            <div className="bb-search-wrap">
              <label className="bb-search"><Search /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, cheque no, reference…" aria-label="Search bank book" /></label>
              <small>Try: {HINTS.map((h, i) => <span key={h}>{i > 0 && ", "}<button type="button" onClick={() => setQ(h)}>{h}</button></span>)}…</small>
            </div>
            <button type="button" className="bb-range" onClick={(e) => setMenu({ anchor: e.currentTarget, items: RANGES.map((r, i) => ({ label: `${r.l} · ${short(r.from).slice(0, 6)} – ${short(r.to)}`, icon: i === range ? <CircleCheck /> : <CalendarRange />, onClick: () => setRange(i) })) })}>
              <CalendarRange /><span>{short(R.from)} – {short(R.to)}</span><ChevronDown />
            </button>
          </div>
          <div className="bb-kpis">
            <div><span className="green"><Wallet /></span><div><small>Opening Balance</small><b>{book ? <Money value={book.opening} dec={0} /> : "—"}</b><em>{short(R.from)}</em></div></div>
            <div><span className="red"><ArrowDown /></span><div><small>Total Withdrawals</small><b className="red">{book ? <Money value={book.withdrawals} dec={0} /> : "—"}</b><em>{wd.length} transaction{wd.length === 1 ? "" : "s"}</em></div></div>
            <div><span className="green"><ArrowUp /></span><div><small>Total Deposits</small><b className="green">{book ? <Money value={book.deposits} dec={0} /> : "—"}</b><em>{dp.length} transaction{dp.length === 1 ? "" : "s"}</em></div></div>
            <div><span className="green"><Database /></span><div><small>Closing Balance</small><b>{book ? <Money value={book.closing} dec={0} /> : "—"}</b><em>{short(R.to)}</em></div></div>
          </div>
          {only && (
            <div className="bb-filter">
              <span className="bb-fchip">{only === "pending" ? <WalletCards /> : <AlertTriangle />}Showing {only === "pending" ? "unpresented payments" : "uncleared deposits"}<button type="button" aria-label="Clear filter" onClick={() => setOnly(null)}><X /></button></span>
            </div>
          )}
          <div className="bb-colhead"><span>Transaction</span><span>Withdrawals</span><span>Deposits</span><span>Running balance</span><span>Status</span></div>
          <div className="bb-ledger">
            {!book ? (
              <div className="cb-boot"><span /><span /><span /></div>
            ) : !days.length ? (
              <div className="bb-empty">
                <span className="bb-empty-ic"><Search /></span><b>No transactions match</b><p>Try another keyword or clear the filter.</p>
                <button type="button" className="btn secondary sm" onClick={() => { setQ(""); setOnly(null); }}>Clear filters</button>
              </div>
            ) : days.map(([d, list], i) => {
              const p = parts(d);
              const last = i === days.length - 1;
              return (
                <div key={d} className="bb-day" style={{ ["--d" as string]: i }}>
                  <div className="bb-daycol">
                    <div className={cn("bb-date", d === isoDay(new Date()) && "today")}><b>{p.d}</b><span>{p.my}</span><small>{p.wd}</small></div>
                    {i === 0 && showOpen && <div className="bb-open-chip"><small>Opening Balance</small><b><Money value={book.opening} dec={0} /></b></div>}
                  </div>
                  <span className={cn("bb-node", last && "pulse")} />
                  <div className="bb-daycard">
                    {showOpen && d === R.from && (
                      <div className="bb-row opening">
                        <span className="bb-row-icon grey"><FileText /></span>
                        <div className="bb-row-text"><b>Opening Balance</b><small>Balance brought forward</small></div>
                        <div className="bb-col"><b className="dash">—</b></div><div className="bb-col"><b className="dash">—</b></div>
                        <div className="bb-col bal"><small>Running Balance</small><b><Money value={book.opening} dec={0} /></b></div><div className="bb-tag-slot" /><span />
                      </div>
                    )}
                    {list.map((r) => {
                      const k = kind(r);
                      const Icon = k.icon;
                      const sub = [r.voucher?.docNo, r.cheque ? `Chq # ${r.cheque.chequeNo}` : r.reference, r.detail && r.detail !== r.description ? r.detail : null].filter(Boolean).join(" · ");
                      return (
                        <div key={r.id} className="bb-row">
                          <span className={cn("bb-row-icon", k.tone)}><Icon /></span>
                          <div className="bb-row-text"><b title={r.description}>{r.description}</b><small>{sub || k.title}</small></div>
                          <div className="bb-col">{r.withdrawal ? <b className="red"><Money value={r.withdrawal} dec={0} /></b> : <b className="dash">—</b>}</div>
                          <div className="bb-col">{r.deposit ? <b className="green"><Money value={r.deposit} dec={0} /></b> : <b className="dash">—</b>}</div>
                          <div className="bb-col bal"><small>Running Balance</small><b><Money value={r.balance} dec={0} /></b></div>
                          <div className="bb-tag-slot"><span className={cn("bb-tag", tag(r.status))}>{tagLabel[r.status] ?? r.status}</span></div>
                          <button type="button" className="bb-more" aria-label={`Actions for ${r.description}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(r) })}><EllipsisVertical /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bb-foot">
            <div className="bb-tip"><Lightbulb /><span><b>Tip:</b> Keep your bank book updated regularly and reconcile with your bank statement monthly.</span></div>
            <button type="button" className="bb-export" disabled={!book} onClick={(e) => exportMenu(e.currentTarget)}><Download />Export Bank Book<ChevronDown /></button>
          </div>
        </section>
        <aside className="bb-side">
          <div className="bb-card bb-recon">
            <h2>Reconciliation Progress</h2>
            <div className="bb-progress">
              <div className="bb-ring">
                <svg viewBox="0 0 80 80" aria-hidden="true"><circle className="trk" cx="40" cy="40" r="33" /><circle className="val" cx="40" cy="40" r="33" pathLength={100} strokeDasharray={100} style={{ strokeDashoffset: 100 - pct }} /></svg>
                <b>{pct}%</b>
              </div>
              <div className="bb-progress-text"><span>{matched} of {rows.length} transactions seen on a statement</span><i><i style={{ width: `${pct}%` }} /></i></div>
            </div>
            <div className="bb-issues">
              <button type="button" className={cn(only === "pending" && "on")} onClick={() => setOnly(only === "pending" ? null : "pending")}><span className="red"><WalletCards /></span><div><b>{pend}</b><small>Unpresented payments</small></div><ChevronRight /></button>
              <button type="button" className={cn(only === "unresolved" && "on")} onClick={() => setOnly(only === "unresolved" ? null : "unresolved")}><span className="amber"><AlertTriangle /></span><div><b>{unres}</b><small>Uncleared deposits</small></div><ChevronRight /></button>
            </div>
            <Link className="bb-reconcile" href="/bank/reconciliation"><RefreshCw />Reconcile with Statement</Link>
            <div className="bb-stmt-foot"><span>{reconTo ? `Reconciled to ${dateLabel(reconTo)}` : "Not reconciled yet"}</span><Link className="bb-link" href="/bank/transactions">View Statement</Link></div>
          </div>
          <div className="bb-card">
            <h2><span className="bb-h2-icon"><FileText /></span>Recent Statement Activity</h2>
            <ul className="bb-stmt">
              <li><span><Database /></span><div><small>Last statement balance</small><b>{stmtBal !== null ? <Money value={stmtBal} dec={0} /> : "—"}</b><em>{reconTo ? `as of ${dateLabel(reconTo)}` : "no reconciliation yet"}</em></div></li>
              <li><span><BookOpen /></span><div><small>Book Balance</small><b>{book ? <Money value={book.closing} dec={0} /> : "—"}</b><em>as of {dateLabel(R.to)}</em></div></li>
            </ul>
            <div className={cn("bb-diff", upToDate && "ok")}><Info /><div><small>Open items</small><b>{pend + unres}</b></div></div>
            <div className="bb-note"><Lightbulb /><span>{upToDate ? "This period is reconciled with the bank statement." : `${pend} unpresented payment${pend === 1 ? "" : "s"} and ${unres} uncleared deposit${unres === 1 ? "" : "s"} are not yet seen on a statement.`}</span></div>
          </div>
        </aside>
      </div>
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
