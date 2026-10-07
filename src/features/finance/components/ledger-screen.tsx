"use client";

import {
  Activity, ArrowUpDown, BookOpen, CalendarDays, ChevronDown, ChevronRight, Coins, Database, Download, FileText, Filter, FolderOpen, Landmark, Network,
  Plus, Search, Trash2, TrendingUp, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, Ledger, LedgerView } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { createLedgerView, deleteLedgerView, getLedger, listAccounts, listLedgerViews, updateLedgerView } from "../api";
import { AccountIcon, CLASS_UI, dateLabel, downloadCsv, Hl, isoDay, Money } from "./finance-ui";

const SING: Record<number, string> = { 1: "Asset", 2: "Liability", 3: "Equity", 4: "Income", 5: "Expense" };
type Range = { label: string; from: string; to: string };
type Filters = { side: "all" | "dr" | "cr"; vt: string; min: string };
const NO_FILTERS: Filters = { side: "all", vt: "all", min: "" };

function presets(): Range[] {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const r = (label: string, a: Date, b: Date) => ({ label, from: isoDay(a), to: isoDay(b) });
  const q = Math.floor(m / 3) * 3;
  return [
    r("This month", new Date(y, m, 1), new Date(y, m + 1, 0)),
    r("Last month", new Date(y, m - 1, 1), new Date(y, m, 0)),
    r("This quarter", new Date(y, q, 1), new Date(y, q + 3, 0)),
    r("Last 12 months", new Date(y, m - 11, 1), new Date(y, m + 1, 0)),
  ];
}
const rangeText = (r: Range) => `${dateLabel(r.from)} – ${dateLabel(r.to)}`;
/** Signed in Dr terms → "1,200.00 Dr" (template drcr()). */
const DrCr = ({ n }: { n: number }) => <><Money value={Math.abs(n)} rs={false} /><small>{n >= 0 ? "Dr" : "Cr"}</small></>;

/** Template app/accounting/ledger (97-coa.js alShell): account banner, stats, related accounts and the ledger table. */
export function LedgerScreen({ accountId }: { accountId: string | null }) {
  const toast = useToast();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [views, setViews] = useState<LedgerView[]>([]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [range, setRange] = useState<Range>(() => presets()[0]!);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState("");
  const [sideQ, setSideQ] = useState("");
  const [newest, setNewest] = useState(false);
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(10);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [custom, setCustom] = useState<Range | null>(null);
  const [saving, setSaving] = useState<{ name: string; isShared: boolean; view: LedgerView | null } | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAccounts(), listLedgerViews()])
      .then(([a, v]) => {
        if (cancelled) return;
        setAccounts(a);
        setViews(v);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load accounts" }));
    return () => {
      cancelled = true;
    };
  }, []);

  const postable = useMemo(() => (accounts ?? []).filter((a) => a.level === 4).sort((x, y) => (x.code < y.code ? -1 : 1)), [accounts]);
  const byId = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);
  const account = (accountId ? postable.find((a) => a.id === accountId) : null) ?? postable[0] ?? null;

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    getLedger(account.id, range.from, range.to)
      .then((l) => !cancelled && setLedger(l))
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the ledger" }));
    return () => {
      cancelled = true;
    };
  }, [account, range]);

  const switchTo = useCallback((id: string) => {
    setPage(1);
    router.replace(`/accounting/ledger?account=${id}`);
  }, [router]);
  const closeMenu = useCallback(() => setMenu(null), []);

  const lg = ledger && account && ledger.account.id === account.id ? ledger : null;
  const sign = account?.nature === "CR" ? -1 : 1;
  /** Lines with the running balance in Dr terms, filtered and sorted; the brought-forward row first (or last when newest first). */
  const rows = useMemo(() => {
    if (!lg) return [];
    let run = lg.opening * sign;
    const all = lg.lines.map((l, i) => {
      run += l.debit - l.credit;
      return { ...l, i, run };
    });
    const needle = q.trim().toLowerCase(), min = Number(filters.min) || 0;
    const shown = all.filter((t) =>
      (filters.vt === "all" || t.voucherType === filters.vt) && (filters.side !== "dr" || t.debit > 0) && (filters.side !== "cr" || t.credit > 0) &&
      (!min || Math.max(t.debit, t.credit) >= min) &&
      (!needle || `${t.docNo ?? ""} ${t.description ?? ""} ${t.referenceNo ?? ""} ${t.voucherType ?? ""} ${t.debit || t.credit}`.toLowerCase().includes(needle)));
    if (newest) shown.reverse();
    return shown;
  }, [lg, sign, q, filters, newest]);
  const lines: ({ bf: true } | (typeof rows)[number])[] = newest ? [...rows, { bf: true }] : [{ bf: true }, ...rows];
  const pages = Math.max(1, Math.ceil(lines.length / per));
  const pg = Math.min(page, pages);
  const pageLines = lines.slice((pg - 1) * per, pg * per);
  const vtypes = [...new Set(lg?.lines.map((l) => l.voucherType).filter((v): v is string => !!v))];
  const chips = [
    ...(filters.vt !== "all" ? [["vt", `Type: ${filters.vt}`]] : []),
    ...(filters.side !== "all" ? [["side", filters.side === "dr" ? "Debits only" : "Credits only"]] : []),
    ...(Number(filters.min) ? [["min", `Amount ≥ Rs ${Number(filters.min).toLocaleString("en-US")}`]] : []),
  ] as [keyof Filters, string][];

  const applyView = (v: LedgerView) => {
    const f = v.filters as Partial<Filters>;
    if (v.dateFrom && v.dateTo) setRange({ label: v.rangeLabel ?? "Saved range", from: v.dateFrom, to: v.dateTo });
    setFilters({ ...NO_FILTERS, ...f });
    setApplied(v.id);
    if (v.accountId) switchTo(v.accountId);
    toast(`Applied view “${v.name}”`, { tone: "info" });
  };
  const saveView = async () => {
    if (!saving || !account) return;
    const body = { name: saving.name, accountId: account.id, rangeLabel: range.label, dateFrom: range.from, dateTo: range.to, filters, isShared: saving.isShared };
    try {
      const v = saving.view ? await updateLedgerView(saving.view.id, { ...body, rowVersion: saving.view.rowVersion }) : await createLedgerView(body);
      setViews((all) => [...all.filter((x) => x.id !== v.id), v].sort((a, b) => a.name.localeCompare(b.name)));
      setApplied(v.id);
      setSaving(null);
      toast(`View “${v.name}” saved`, { tone: "good" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not save the view", { tone: "danger" });
    }
  };
  const removeView = async (v: LedgerView) => {
    try {
      await deleteLedgerView(v.id, v.rowVersion);
      setViews((all) => all.filter((x) => x.id !== v.id));
      if (applied === v.id) setApplied(null);
      toast(`View “${v.name}” deleted`, { tone: "good" });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not delete the view", { tone: "danger" });
    }
  };
  const exportCsv = () => {
    if (!lg || !account) return;
    downloadCsv(`ledger-${account.code}-${range.from}-${range.to}.csv`, [
      ["Date", "Voucher", "Type", "Particulars", "Reference", "Debit", "Credit", "Balance"],
      ["", "", "", "Balance brought forward", "", "", "", lg.opening * sign],
      ...rows.map((t) => [t.postingDate, t.docNo, t.voucherType, t.description, t.referenceNo, t.debit, t.credit, t.run]),
    ]);
  };

  if (error) return <div className="al"><ErrorState message={error.message} reference={error.reference} onRetry={() => location.reload()} /></div>;
  if (accounts && !postable.length) {
    return (
      <div className="al">
        <EmptyState icon={<BookOpen />} title="No postable accounts yet" description="Set up the chart of accounts first; each postable account then has a ledger here." action={<Link className="btn primary" href="/accounting/coa">Open chart of accounts</Link>} />
      </div>
    );
  }

  const parent = account?.parentId ? byId.get(account.parentId) : undefined;
  const grand = parent?.parentId ? byId.get(parent.parentId) : undefined;
  const tone = account ? CLASS_UI[account.accountClass]?.tone : undefined;
  const nDr = rows.filter((t) => t.debit > 0).length;
  const open = lg ? lg.opening : 0, close = lg ? lg.closing : 0;
  const mine = views.find((v) => v.id === applied && v.isMine);
  const side = postable.filter((a) => !sideQ.trim() || a.code.includes(sideQ.trim()) || a.name.toLowerCase().includes(sideQ.trim().toLowerCase()));

  return (
    <div className="al">
      <div className="al-head">
        <div>
          <div className="al-crumbs"><Link href="/accounting/coa">Accounting</Link><ChevronRight /><span>Ledgers</span></div>
          <h1>Account Ledger</h1>
          <p>Detailed transactions, running balance and insights for any account.</p>
        </div>
        <div className="al-head-actions">
          <button className="al-btn" type="button" onClick={(e) => setMenu({
            anchor: e.currentTarget,
            items: [
              ...presets().map((p) => ({ label: `${p.label} · ${rangeText(p)}`, icon: <CalendarDays />, onClick: () => { setRange(p); setPage(1); } })),
              { sep: true as const },
              { label: "Custom range…", icon: <CalendarDays />, onClick: () => setCustom({ ...range, label: "Custom range" }) },
            ],
          })}>
            <CalendarDays /><span>{rangeText(range)}</span><ChevronDown className="cv" />
          </button>
          <button className="al-btn" type="button" onClick={(e) => setMenu({
            anchor: e.currentTarget,
            items: [
              ...views.map((v) => ({ label: `${v.name}${v.isMine ? "" : ` · ${v.ownerName}`}`, icon: <FolderOpen />, onClick: () => applyView(v) })),
              ...(views.length ? [{ sep: true as const }] : []),
              { label: "Save current view…", icon: <Plus />, disabled: !account, onClick: () => setSaving({ name: "", isShared: false, view: null }) },
              ...(mine ? [
                { label: `Update “${mine.name}”`, icon: <FileText />, onClick: () => setSaving({ name: mine.name, isShared: mine.isShared, view: mine }) },
                { label: `Delete “${mine.name}”`, icon: <Trash2 />, danger: true, onClick: () => removeView(mine) },
              ] : []),
            ],
          })}>
            <FolderOpen />Saved Views<ChevronDown className="cv" />
          </button>
          <button className="al-btn" type="button" disabled={!lg} onClick={exportCsv}><Download />Export CSV</button>
          <Link className="al-btn primary" href="/accounting/coa" style={{ textDecoration: "none" }}><BookOpen />Chart of Accounts</Link>
        </div>
      </div>

      <div className={cn("al-card al-account", tone)}>
        {account ? (
          <>
            <span className="al-account-icon"><AccountIcon account={account} /></span>
            <div className="al-account-text">
              <div><h2>{account.name}</h2><span className="al-status">{account.status === "ACTIVE" ? "Active" : "Inactive"}</span></div>
              <p>{account.code}<i />{SING[account.accountClass]}{grand && <><i />{grand.name}</>}{parent && <><i />{parent.name}</>}<i />{account.nature === "DR" ? "Debit" : "Credit"}</p>
              <small>{account.description ?? ""}</small>
            </div>
            <div className="al-office"><Landmark /><div><b>{account.branchIds.length ? `${account.branchIds.length} branch${account.branchIds.length > 1 ? "es" : ""}` : "All branches"}</b><small>Main book · {account.currencyCode}</small></div></div>
            <label className="al-select al-switch" title="Switch account">
              <select aria-label="Switch account" value={account.id} onChange={(e) => switchTo(e.target.value)}>
                {postable.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
              <ChevronDown />
            </label>
          </>
        ) : <Skeleton style={{ height: 56, width: "100%" }} />}
      </div>

      <div className="al-stats">
        <Stat tone="ct-green" icon={<Database />} label="Opening Balance" value={lg && <Money value={open} dec={0} />} em={`as at ${dateLabel(range.from)} · ${account?.nature === "CR" ? "Cr" : "Dr"}`} />
        <Stat tone="ct-green" icon={<TrendingUp />} label="Total Debits" value={lg && <Money value={lg.debit} dec={0} />} em={`${nDr} transactions`} />
        <Stat tone="ct-orange" icon={<Activity />} label="Total Credits" value={lg && <Money value={lg.credit} dec={0} />} em={`${rows.length - nDr} transactions`} />
        <Stat tone="ct-blue" icon={<Coins />} label="Closing Balance" value={lg && <Money value={close} dec={0} />} em={<><TrendingUp />{close - open >= 0 ? "+" : "−"}Rs {Math.abs(close - open).toLocaleString("en-US")} net</>} emCls={close - open >= 0 ? "up" : "down"} />
        <Stat tone="ct-violet" icon={<FileText />} label="Transactions" value={lg && String(lg.lines.length)} em="in this period" />
      </div>

      <div className="al-body">
        <aside className="al-card al-side">
          <h3>Related Accounts <span>{postable.length}</span></h3>
          <label className="al-search"><Search /><input placeholder="Search accounts…" aria-label="Search accounts" value={sideQ} onChange={(e) => setSideQ(e.target.value)} /></label>
          <ul>
            {side.length ? side.slice(0, 60).map((a) => (
              <li key={a.id}>
                <button type="button" className={cn(CLASS_UI[a.accountClass]?.tone, a.id === account?.id && "active")} onClick={() => a.id !== account?.id && switchTo(a.id)}>
                  <span className="al-side-icon"><AccountIcon account={a} /></span>
                  <span style={{ minWidth: 0 }}><b title={a.name}><Hl text={a.name} q={sideQ.trim()} /></b><small>{a.code}<i />{SING[a.accountClass]}</small></span>
                  <strong className={cn(a.nature === "CR" && "cr")}><Money value={a.balance} dec={0} /></strong>
                </button>
              </li>
            )) : <li className="al-empty">No accounts match “{sideQ}”</li>}
          </ul>
          <Link className="al-btn wide" href="/accounting/coa"><Network />View chart of accounts</Link>
        </aside>

        <div className="al-card al-main">
          <div className="al-main-head">
            <div><h3>Ledger Transactions <span>({rows.length})</span></h3><p>Every posting in date order with the running balance after each transaction.</p></div>
            <div className="al-main-tools">
              <label className="al-search wide"><Search /><input placeholder="Search voucher, particulars or amount…" aria-label="Search transactions" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
              <button className={cn("al-btn", showFilters && "on")} type="button" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}><Filter />Filters <span className="al-pill">{chips.length}</span></button>
              <div className="al-seg" role="group" aria-label="Sort">
                <button type="button" className={cn(!newest && "active")} onClick={() => setNewest(false)}>Oldest</button>
                <button type="button" className={cn(newest && "active")} onClick={() => setNewest(true)}>Newest</button>
              </div>
            </div>
          </div>
          <div className={cn("al-filters-wrap", showFilters && "open")}>
            <div>
              <div className="al-filters">
                <label className="al-filter"><small>Voucher type</small>
                  <select value={filters.vt} onChange={(e) => { setFilters((f) => ({ ...f, vt: e.target.value })); setPage(1); }}>
                    <option value="all">All types</option>
                    {vtypes.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="al-filter"><small>Transaction side</small>
                  <select value={filters.side} onChange={(e) => { setFilters((f) => ({ ...f, side: e.target.value as Filters["side"] })); setPage(1); }}>
                    <option value="all">Debits and credits</option><option value="dr">Debits only</option><option value="cr">Credits only</option>
                  </select>
                </label>
                <label className="al-filter"><small>Minimum amount (Rs)</small>
                  <input type="number" min={0} step={1000} placeholder="Any amount" value={filters.min} onChange={(e) => { setFilters((f) => ({ ...f, min: e.target.value })); setPage(1); }} />
                </label>
              </div>
            </div>
          </div>
          <div className="al-chips">
            {chips.length > 0 && (
              <>
                {chips.map(([k, label]) => (
                  <span key={k}>{label}<button type="button" aria-label="Remove filter" onClick={() => setFilters((f) => ({ ...f, [k]: NO_FILTERS[k] }))}><X /></button></span>
                ))}
                <button type="button" className="al-link" onClick={() => setFilters(NO_FILTERS)}>Clear all</button>
              </>
            )}
          </div>
          <div className="al-table">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => setNewest((n) => !n)}>Date <ArrowUpDown /></th><th>Voucher</th><th>Particulars</th>
                  <th className="num">Debit (Rs)</th><th className="num">Credit (Rs)</th><th className="num">Balance (Rs)</th><th className="ctr" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {!lg && <tr className="al-none"><td colSpan={7}><Skeleton style={{ height: 18 }} /></td></tr>}
                {lg && pageLines.map((t) => "bf" in t ? (
                  <tr key="bf" className="bf">
                    <td className="date">{dateLabel(range.from)}</td><td><span className="al-ref">—</span></td>
                    <td className="part"><b>Balance brought forward</b><small>Opening · {account?.nature === "CR" ? "Credit" : "Debit"} nature</small></td>
                    <td className="num"><i>—</i></td><td className="num"><i>—</i></td><td className="num bal"><DrCr n={lg.opening * sign} /></td><td className="ctr" />
                  </tr>
                ) : (
                  <tr key={t.i}>
                    <td className="date">{dateLabel(t.postingDate)}</td>
                    <td><span className="al-ref"><Hl text={t.docNo ?? "—"} q={q.trim()} /></span>{t.voucherType && <span className={cn("al-type", t.voucherType.toLowerCase())}>{t.voucherType}</span>}</td>
                    <td className="part"><b><Hl text={t.description ?? ""} q={q.trim()} /></b>{t.referenceNo && <small>Ref {t.referenceNo}</small>}</td>
                    <td className={cn("num", t.debit > 0 && "dr")}>{t.debit ? <Money value={t.debit} rs={false} /> : <i>—</i>}</td>
                    <td className={cn("num", t.credit > 0 && "cr")}>{t.credit ? <Money value={t.credit} rs={false} /> : <i>—</i>}</td>
                    <td className="num bal"><DrCr n={t.run} /></td>
                    <td className="ctr" />
                  </tr>
                ))}
                {lg && !lg.lines.length && (
                  <tr className="al-none"><td colSpan={7}>No postings in this period. Vouchers post to the ledger once they are approved (Phase 16).</td></tr>
                )}
                {lg && lg.lines.length > 0 && !rows.length && <tr className="al-none"><td colSpan={7}>No transactions match your search or filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="al-foot">
            <span>Showing {lines.length ? (pg - 1) * per + 1 : 0}–{Math.min(lines.length, pg * per)} of {lines.length} lines</span>
            <span className="al-foot-tot">
              <small>Page totals</small>
              <b className="dr"><Money value={pageLines.reduce((s, t) => s + ("bf" in t ? 0 : t.debit), 0)} rs={false} /></b>
              <b className="cr"><Money value={pageLines.reduce((s, t) => s + ("bf" in t ? 0 : t.credit), 0)} rs={false} /></b>
              <small>Ending balance</small>
              <b><DrCr n={close * sign} /></b>
            </span>
            <span className="al-foot-rows">Rows <label className="coa-select"><select aria-label="Rows per page" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}>{[10, 25, 50].map((n) => <option key={n}>{n}</option>)}</select><ChevronDown /></label></span>
            <div className="coa-pager">
              <button type="button" disabled={pg === 1} onClick={() => setPage(pg - 1)}>‹</button>
              {Array.from({ length: pages }, (_, i) => <button key={i} type="button" className={cn(i + 1 === pg && "active")} onClick={() => setPage(i + 1)}>{i + 1}</button>)}
              <button type="button" disabled={pg === pages} onClick={() => setPage(pg + 1)}>›</button>
            </div>
          </div>
        </div>
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}

      <Modal open={!!custom} onClose={() => setCustom(null)} title="Custom range" subtitle="Show the ledger between two dates" foot={
        <>
          <button type="button" className="btn secondary" onClick={() => setCustom(null)}>Cancel</button>
          <button type="button" className="btn primary" disabled={!custom || !custom.from || !custom.to || custom.to < custom.from} onClick={() => { setRange(custom!); setPage(1); setCustom(null); }}>Apply</button>
        </>
      }>
        {custom && (
          <FormGrid>
            <Field label="From"><input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></Field>
            <Field label="To" error={custom.to && custom.from && custom.to < custom.from ? "End after start" : undefined}><input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></Field>
          </FormGrid>
        )}
      </Modal>

      <Modal open={!!saving} onClose={() => setSaving(null)} title={saving?.view ? "Update view" : "Save view"} subtitle="Keeps the account, period and filters" foot={
        <>
          <button type="button" className="btn secondary" onClick={() => setSaving(null)}>Cancel</button>
          <button type="button" className="btn primary" disabled={!saving?.name.trim()} onClick={saveView}>Save view</button>
        </>
      }>
        {saving && (
          <FormGrid cols={1}>
            <Field label="View name" required><input value={saving.name} autoFocus maxLength={80} placeholder="e.g. Month-end review" onChange={(e) => setSaving({ ...saving, name: e.target.value })} /></Field>
            <Switch label="Share with everyone who can open ledgers" checked={saving.isShared} onChange={(e) => setSaving({ ...saving, isShared: e.target.checked })} />
          </FormGrid>
        )}
      </Modal>
    </div>
  );
}

function Stat({ tone, icon, label, value, em, emCls }: { tone: string; icon: ReactNode; label: string; value: ReactNode; em: ReactNode; emCls?: string }) {
  return (
    <div className={cn("al-stat", tone)}>
      <span className="al-stat-icon">{icon}</span>
      <div>
        <small>{label}</small>
        <b className="num">{value ?? <Skeleton style={{ height: 20, width: 90 }} />}</b>
        <em className={emCls}>{em}</em>
      </div>
    </div>
  );
}
