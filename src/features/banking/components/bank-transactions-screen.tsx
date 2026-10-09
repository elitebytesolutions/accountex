"use client";

import { ArrowDownLeft, ArrowUpRight, Banknote, Clock, Download, Eye, Filter, GitCompare, MoreHorizontal, Percent, Plus, Search, Tag, Upload, User, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BankingOptions, BankTxn, BankTxnList } from "@/shared";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay, Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { bankingOptions, categoriseTxn, listBankTxns } from "../api";
import { amt, bankLabel, CATEGORY_LABEL, CategoriseModal, errMsg, QUICK_CATEGORIES, TxnStatus, type CategoriseBody } from "./bank-ui";
import { StatementImportModal } from "./statement-import-modal";

type Can = { create: boolean; edit: boolean };
type Chip = "" | "deposit" | "withdrawal" | "uncategorised";
const PAGE = 12;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Template app/bank/transactions (40-acc-core.html): KPIs, filters, the statement-line table with Categorise, import modal. */
export function BankTransactionsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const now = new Date();
  const [options, setOptions] = useState<BankingOptions | null>(null);
  const [data, setData] = useState<BankTxnList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [account, setAccount] = useState("");
  const [chip, setChip] = useState<Chip>("");
  const [from, setFrom] = useState(() => isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => isoDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [big, setBig] = useState(false);
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const [importing, setImporting] = useState(false);
  const [categorising, setCategorising] = useState<{ txn: BankTxn; category: string | null; accountId: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    bankingOptions().then(setOptions).catch(() => setOptions(null));
  }, [attempt]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listBankTxns({ account, from, to, type: chip || undefined, search, mine: mine ? "1" : undefined, minAmount: big ? 100000 : undefined, page, pageSize: PAGE })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load bank transactions" }));
    return () => { cancelled = true; };
  }, [account, from, to, chip, search, mine, big, page, attempt]);
  const reload = () => setAttempt((n) => n + 1);
  const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); setPicked(new Set()); };

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = !!(account || chip || search || mine || big);
  const k = data?.kpis;
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const periodTitle = sameMonth && from.endsWith("-01") ? `${MONTHS[Number(from.slice(5, 7)) - 1]} ${from.slice(0, 4)}` : `${dateLabel(from)} – ${dateLabel(to)}`;
  const accountTitle = account ? bankLabel(options?.bankAccounts.find((b) => b.id === account)) : "All bank accounts";

  const bankShort = (t: BankTxn) => {
    const b = options?.bankAccounts.find((x) => x.id === t.bankAccount.id);
    const name = b?.bankName || t.bankAccount.title;
    return t.bankAccount.last4 ? `${name} — ${t.bankAccount.last4}` : name;
  };
  const categorise = async (txn: BankTxn, body: CategoriseBody) => {
    const r = await categoriseTxn(txn.id, { ...body, rowVersion: txn.rowVersion });
    const v = r.voucher;
    toast(
      v?.status === "PENDING_APPROVAL" ? `${v.docNo} raised · waiting for approval` : `Categorised${body.category ? ` as ${CATEGORY_LABEL[body.category]}` : ""}${v ? ` · ${v.docNo} posted` : ""}`,
      { tone: v?.status === "PENDING_APPROVAL" ? "warn" : "good", action: v ? { label: "Open", onClick: () => router.push(`/accounting/vouchers/${v.id}`) } : undefined },
    );
    setCategorising(null);
    reload();
  };
  const quick = async (txn: BankTxn, c: (typeof QUICK_CATEGORIES)[number]) => {
    const role = c.role ? options?.postingRoles[c.role] : null;
    if (!role) return setCategorising({ txn, category: c.category, accountId: null });
    setBusy(txn.id);
    try {
      await categorise(txn, { accountId: role.id, category: c.category, costCentreId: null, narration: null });
    } catch (e) {
      toast(errMsg(e, "Could not categorise"), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const catMenu = (txn: BankTxn): MenuItem[] => [
    ...QUICK_CATEGORIES.map((c) => ({ label: c.label, icon: <Tag />, onClick: () => quick(txn, c) })),
    { sep: true as const },
    { label: "Other account…", icon: <Tag />, onClick: () => setCategorising({ txn, category: null, accountId: null }) },
  ];
  const rowMenu = (t: BankTxn): MenuItem[] => {
    const out: MenuItem[] = [];
    if (t.voucher) out.push({ label: `Open ${t.voucher.docNo}`, icon: <Eye />, onClick: () => router.push(`/accounting/vouchers/${t.voucher!.id}`) });
    if (t.cheque) out.push({ label: `Cheque ${t.cheque.chequeNo}`, icon: <Banknote />, onClick: () => router.push("/bank/cheque-register") });
    out.push({ label: "Bank reconciliation", icon: <GitCompare />, onClick: () => router.push("/bank/reconciliation") });
    return out;
  };
  const filterMenu = (anchor: HTMLElement) =>
    setMenu({
      anchor,
      items: [
        { label: mine ? "✓ Created by me" : "Created by me", icon: <User />, onClick: () => filter(setMine)(!mine) },
        { label: big ? "✓ Amount above Rs 100,000" : "Amount above Rs 100,000", icon: <Banknote />, onClick: () => filter(setBig)(!big) },
        { sep: true },
        { label: "Clear filters", icon: <X />, onClick: () => { setAccount(""); setChip(""); setQ(""); setSearch(""); setMine(false); setBig(false); setPage(1); } },
      ],
    });
  const exportRows = () => {
    const rows = picked.size ? items.filter((t) => picked.has(t.id)) : items;
    downloadCsv(`bank-transactions-${isoDay(new Date())}.csv`, [
      ["Date", "Bank", "Description", "Detail", "Cheque / Ref", "Voucher", "Deposit", "Withdrawal", "Status", "Category"],
      ...rows.map((t) => [t.txnDate, bankLabel(t.bankAccount), t.description, t.detail, t.cheque?.chequeNo ?? t.reference, t.voucher?.docNo ?? null, t.deposit ? t.deposit.toFixed(2) : null, t.withdrawal ? t.withdrawal.toFixed(2) : null, t.status, t.category]),
    ]);
    toast(`Bank transactions exported (${rows.length} rows)`, { tone: "good" });
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const pageIn = items.reduce((s, t) => s + t.deposit, 0);
  const pageOut = items.reduce((s, t) => s + t.withdrawal, 0);
  const counts = data?.statusCounts ?? {};

  return (
    <>
      <PageHead
        eyebrow="Bank / Transactions"
        title="Bank Transactions"
        description="Deposits and withdrawals from imported statements and posted vouchers."
        actions={
          <>
            <Button icon={<Download />} disabled={!items.length} onClick={exportRows}>Export</Button>
            {can.create && <Button icon={<Upload />} onClick={() => setImporting(true)}>Import statement</Button>}
            {can.create && <ButtonLink variant="primary" icon={<Plus />} href="/accounting/vouchers/new?type=BPV">New transaction</ButtonLink>}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Deposits</span><span className="icon-well"><ArrowDownLeft /></span></div><strong>{k ? <Money value={k.deposits} dec={0} /> : "—"}</strong><small>{periodTitle}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Withdrawals</span><span className="icon-well"><ArrowUpRight /></span></div><strong>{k ? <Money value={k.withdrawals} dec={0} /> : "—"}</strong><small>{periodTitle}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Uncategorised</span><span className="icon-well"><Tag /></span></div><strong>{k?.uncategorised ?? "—"}</strong><small>From imported statement</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Bank charges</span><span className="icon-well"><Percent /></span></div><strong>{k ? <Money value={k.bankCharges} dec={0} /> : "—"}</strong><small>Categorised as bank charges</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Statement lines</h3><p>{accountTitle} · {periodTitle}{filtered ? ` · ${total} match the filters` : ""}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search description, cheque no., amount…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <select value={account} onChange={(e) => filter(setAccount)(e.target.value)} aria-label="Bank account">
            <option value="">All bank accounts</option>
            {options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.bankName ? `${b.bankName} — ` : ""}{b.last4 ?? b.title}</option>)}
          </select>
          <div className="chips">
            <button type="button" className={cn(!chip && "active")} onClick={() => filter(setChip)("")}>All</button>
            <button type="button" className={cn(chip === "deposit" && "active")} onClick={() => filter(setChip)("deposit")}>Deposits</button>
            <button type="button" className={cn(chip === "withdrawal" && "active")} onClick={() => filter(setChip)("withdrawal")}>Withdrawals</button>
            <button type="button" className={cn(chip === "uncategorised" && "active")} onClick={() => filter(setChip)("uncategorised")}>Uncategorised <i>{counts.UNCATEGORISED ?? 0}</i></button>
          </div>
          <input type="date" aria-label="From" value={from} max={to} onChange={(e) => e.target.value && filter(setFrom)(e.target.value)} />
          <input type="date" aria-label="To" value={to} min={from} onChange={(e) => e.target.value && filter(setTo)(e.target.value)} />
          <span className="spacer" />
          <Button size="sm" icon={<Filter />} className={cn((mine || big) && "active")} onClick={(e) => filterMenu(e.currentTarget)}>Filters{mine || big ? ` · ${Number(mine) + Number(big)}` : ""}</Button>
        </div>
        {!data ? (
          <div style={{ padding: 18 }}><Skeleton style={{ height: 320 }} /></div>
        ) : !items.length ? (
          <EmptyState
            icon={<ArrowDownLeft />}
            title={filtered ? "No transactions match" : "No bank transactions in this period"}
            description={filtered ? "Try another account, type or search." : "Posted bank vouchers and imported statement lines appear here."}
            action={can.create && !filtered ? <Button variant="primary" icon={<Upload />} onClick={() => setImporting(true)}>Import statement</Button> : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Select page" checked={picked.size === items.length} onChange={(e) => setPicked(e.target.checked ? new Set(items.map((t) => t.id)) : new Set())} /></th>
                  <th>Date</th><th>Bank</th><th>Description</th><th>Cheque / Ref</th><th>Voucher</th><th className="num">Deposit</th><th className="num">Withdrawal</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {items.map((t) => {
                  const pending = t.status === "UNCATEGORISED" && t.voucher;
                  const sub = t.category ? CATEGORY_LABEL[t.category] : t.detail && t.detail !== t.description ? t.detail : t.source === "STATEMENT_IMPORT" ? "From imported statement" : null;
                  return (
                    <tr key={t.id}>
                      <td><input type="checkbox" aria-label="Select line" checked={picked.has(t.id)} onChange={(e) => { const s = new Set(picked); if (e.target.checked) s.add(t.id); else s.delete(t.id); setPicked(s); }} /></td>
                      <td>{dateLabel(t.txnDate)}</td>
                      <td>{bankShort(t)}</td>
                      <td><Hl text={t.description} q={search} />{sub && <small>{sub}</small>}</td>
                      <td>{t.cheque?.chequeNo ?? (t.reference ? <Hl text={t.reference} q={search} /> : <span className="muted">—</span>)}</td>
                      <td>{t.voucher ? <Link className="link" href={`/accounting/vouchers/${t.voucher.id}`}>{t.voucher.docNo}</Link> : <span className="muted">—</span>}{pending && <small>Waiting for approval</small>}</td>
                      <td className={cn("num", t.deposit ? "dr" : "zero")}>{t.deposit ? amt(t.deposit) : "—"}</td>
                      <td className={cn("num", t.withdrawal ? "cr" : "zero")}>{t.withdrawal ? amt(t.withdrawal) : "—"}</td>
                      <td><TxnStatus status={t.status} /></td>
                      <td className="actions">
                        {t.status === "UNCATEGORISED" && !pending && can.create ? (
                          <button type="button" className="btn ghost sm" disabled={busy === t.id} onClick={(e) => setMenu({ anchor: e.currentTarget, items: catMenu(t) })}>{busy === t.id ? "Saving…" : "Categorise"}</button>
                        ) : pending ? (
                          <span className="po-chq-note"><Clock style={{ width: 13, height: 13, verticalAlign: "-2px" }} /> Approval</span>
                        ) : (
                          <button type="button" className="icon-btn-sm" aria-label="Actions" onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(t) })}><MoreHorizontal /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="total"><td colSpan={6}>Page total ({items.length} line{items.length === 1 ? "" : "s"})</td><td className="num">{amt(pageIn)}</td><td className="num">{amt(pageOut)}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
          </div>
        )}
        {data && total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total.toLocaleString("en-US")}</span>
            <Pager page={page} pages={pages} onPage={setPage} />
          </div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      <StatementImportModal
        open={importing}
        options={options}
        bankAccountId={account || null}
        onClose={() => setImporting(false)}
        onImported={(r) => { toast(`${r.imported} lines imported · ${r.import.matchedCount} auto-matched`, { tone: "good" }); setAttempt((n) => n + 1); }}
      />
      <CategoriseModal
        target={categorising ? { description: categorising.txn.description, amount: categorising.txn.deposit || -categorising.txn.withdrawal, category: categorising.category, accountId: categorising.accountId } : null}
        options={options}
        onClose={() => setCategorising(null)}
        onSave={(body) => categorise(categorising!.txn, body)}
      />
    </>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const list: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) list.push(p);
    else if (list[list.length - 1] !== "…") list.push("…");
  }
  return (
    <div className="pager">
      <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>‹</button>
      {list.map((p, i) => (p === "…" ? <button key={`g${i}`} type="button" disabled>…</button> : <button key={p} type="button" className={cn(p === page && "active")} onClick={() => onPage(p)}>{p}</button>))}
      <button type="button" disabled={page === pages} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}
