"use client";

import {
  Activity, ArrowUpDown, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Coins, Download, EllipsisVertical, FileText, Filter,
  FolderTree, History, LayoutGrid, List, ListTree, Network, Pencil, Plus, Search, Tag, Trash2, TrendingUp, TriangleAlert, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Account, AccountTemplate } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Drawer, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { applyAccountTemplate, deleteAccount, listAccounts, listAccountTemplates, listRetiredAccountCodes, setAccountsStatus } from "../api";
import { AccountModal, type AccountModalMode } from "./account-modal";
import { AccountIcon, CLASS_UI, dateLabel, downloadCsv, Hl, kindLabel, Money } from "./finance-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Row = { a: Account; depth: number; last: boolean; lasts: boolean[]; ctx: boolean; open: boolean; kc: number };
const STEP = 28;
const DEFAULT_OPEN = ["1000", "1100", "1110", "1120"];
const LOOKUPS = ["AccountSubType"];

/** Template app/accounting/coa (46-coa.html + 97-coa.js): KPI cards, filters, bulk toolbar and the account tree grid. */
export function CoaScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const lookups = useLookups(LOOKUPS);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [retired, setRetired] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<Set<string>>(() => new Set(DEFAULT_OPEN));
  const [qClosed, setQClosed] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [level, setLevel] = useState("all");
  const [density, setDensity] = useState<"list" | "comfy" | "grid">("comfy");
  const [sort, setSort] = useState<{ key: "name" | "code" | "bal" | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [page, setPage] = useState(1);
  const [per, setPer] = useState(25);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [modal, setModal] = useState<AccountModalMode>(null);
  const [del, setDel] = useState<Account | null>(null);
  const [history, setHistory] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAccounts(), listAccountTemplates(), listRetiredAccountCodes()])
      .then(([a, t, r]) => {
        if (cancelled) return;
        setAccounts(a);
        setTemplates(t);
        setRetired(r);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the chart of accounts" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const all = useMemo(() => accounts ?? [], [accounts]);
  const byId = useMemo(() => new Map(all.map((a) => [a.id, a])), [all]);
  const kids = useMemo(() => {
    const m = new Map<string | null, Account[]>();
    for (const a of all) m.set(a.parentId, [...(m.get(a.parentId) ?? []), a]);
    for (const list of m.values()) list.sort((x, y) => (x.code < y.code ? -1 : 1));
    return m;
  }, [all]);
  /** Balance of an account: its own for postable accounts, the sum of its sub-accounts otherwise. */
  const bal = useMemo(() => {
    const memo = new Map<string, number>();
    const f = (a: Account): number => {
      if (memo.has(a.id)) return memo.get(a.id)!;
      const v = a.level === 4 ? a.balance : (kids.get(a.id) ?? []).reduce((s, k) => s + f(k), 0);
      memo.set(a.id, v);
      return v;
    };
    return f;
  }, [kids]);

  const filtersActive = type !== "all" || status !== "all" || level !== "all";
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase(), active = !!needle || filtersActive;
    const info = new Map<string, { m: boolean; d: boolean }>();
    const selfMatch = (a: Account) =>
      (!needle || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)) &&
      (type === "all" || a.kind === type) && (status === "all" || a.status === status) && (level === "all" || a.level === Number(level));
    const scan = (a: Account): boolean => {
      const m = selfMatch(a);
      let d = false;
      for (const k of kids.get(a.id) ?? []) if (scan(k)) d = true;
      info.set(a.id, { m, d });
      return m || d;
    };
    const roots = (kids.get(null) ?? []).filter((r) => cat === "all" || String(r.accountClass) === cat);
    roots.forEach(scan);
    const sorted = (list: Account[]) => {
      if (!sort.key) return list;
      const v = (a: Account) => (sort.key === "bal" ? bal(a) : sort.key === "name" ? a.name.toLowerCase() : a.code);
      return [...list].sort((x, y) => (v(x) < v(y) ? -1 : v(x) > v(y) ? 1 : 0) * sort.dir);
    };
    const out: Row[] = [];
    const walk = (list: Account[], depth: number, lasts: boolean[]) => {
      const shown = sorted(list.filter((n) => !active || info.get(n.id)!.m || info.get(n.id)!.d));
      shown.forEach((n, i) => {
        const last = i === shown.length - 1, inf = info.get(n.id)!;
        const isOpen = active ? inf.d && !qClosed.has(n.id) : open.has(n.code);
        const kc = (kids.get(n.id) ?? []).length;
        const r: Row = { a: n, depth, last, lasts: [...lasts, last], ctx: active && !inf.m, open: isOpen && kc > 0, kc };
        out.push(r);
        if (isOpen && kc) walk(kids.get(n.id)!, depth + 1, r.lasts);
      });
    };
    walk(roots, 1, []);
    return out;
  }, [q, cat, type, status, level, filtersActive, kids, open, qClosed, sort, bal]);

  const pages = Math.max(1, Math.ceil(rows.length / per));
  const pg = Math.min(page, pages);
  const pageRows = rows.slice((pg - 1) * per, pg * per);
  const onPage = pageRows.filter((r) => sel.has(r.a.id)).length;
  const selected = all.filter((a) => sel.has(a.id));

  const toggle = (r: Row) => {
    if (q.trim() || filtersActive) setQClosed((s) => { const n = new Set(s); if (r.open) n.add(r.a.id); else n.delete(r.a.id); return n; });
    else setOpen((s) => { const n = new Set(s); if (n.has(r.a.code)) n.delete(r.a.code); else n.add(r.a.code); return n; });
  };
  const resetFilters = () => {
    setQ(""); setCat("all"); setType("all"); setStatus("all"); setLevel("all"); setQClosed(new Set()); setSort({ key: null, dir: 1 }); setPage(1);
  };
  const sortBy = (key: "name" | "code" | "bal") => setSort((s) => (s.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : { key: null, dir: 1 }));
  const selectPage = (on: boolean) => setSel((s) => { const n = new Set(s); for (const r of pageRows) if (on) n.add(r.a.id); else n.delete(r.a.id); return n; });
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** Opens the path to a saved account, jumps to its page and flashes it (template save()). */
  const saved = useCallback((id: string) => {
    setModal(null);
    listAccounts().then((list) => {
      setAccounts(list);
      const map = new Map(list.map((a) => [a.id, a]));
      setOpen((s) => {
        const n = new Set(s);
        for (let p = map.get(id)?.parentId; p; p = map.get(p)?.parentId) n.add(map.get(p)!.code);
        return n;
      });
      setFlash(id);
      setTimeout(() => setFlash(null), 1900);
    }).catch(() => setAttempt((n) => n + 1));
  }, []);

  const setStatusOf = async (ids: string[], to: "ACTIVE" | "INACTIVE") => {
    try {
      const { updated } = await setAccountsStatus(ids, to);
      const one = ids.length === 1 ? byId.get(ids[0]!) : null;
      toast(updated ? `${one ? one.name : `${updated} accounts`} ${to === "ACTIVE" ? "activated" : "deactivated"}` : `Already ${to.toLowerCase()}`, { tone: to === "ACTIVE" ? "good" : "warn" });
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not update", { tone: "danger" });
    }
  };
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try {
      await deleteAccount(del.id, del.rowVersion);
      toast(`Deleted ${del.code} · ${del.name}`, { tone: "danger" });
      setSel((s) => { const n = new Set(s); n.delete(del.id); return n; });
      setDel(null);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not delete", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = (list: Account[]) =>
    downloadCsv("chart-of-accounts.csv", [
      ["Code", "Name", "Type", "Level", "Class", "Parent", "Nature", "Sub-type", "Balance", "Status"],
      ...list.map((a) => [a.code, a.name, kindLabel(a.kind), a.level, CLASS_UI[a.accountClass]?.name ?? "", a.parentId ? (byId.get(a.parentId)?.code ?? "") : "", a.nature, a.subType, bal(a), a.status]),
    ]);
  const apply = async (t: AccountTemplate) => {
    setBusy(true);
    try {
      const { created } = await applyAccountTemplate(t.id);
      toast(`${created} accounts created from ${t.name}`, { tone: "good" });
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not apply the template", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const rowMenu = (anchor: HTMLElement, a: Account) => {
    const items: MenuItem[] = [];
    if (can.create) items.push(a.level < 4 ? { label: "Add sub-account", icon: <Plus />, onClick: () => setModal({ parentId: a.id }) } : { label: "Add sibling account", icon: <Plus />, onClick: () => setModal({ parentId: a.parentId }) });
    if (can.edit) items.push({ label: "Edit", icon: <Pencil />, onClick: () => setModal({ edit: a }) });
    if (a.level === 4) items.push({ label: "View ledger", icon: <BookOpen />, onClick: () => router.push(`/accounting/ledger?account=${a.id}`) });
    items.push({ label: "History", icon: <History />, onClick: () => setHistory(a) });
    if (can.edit || can.remove) items.push({ sep: true });
    if (can.edit) items.push(a.status === "ACTIVE" ? { label: "Deactivate", icon: <X />, onClick: () => setStatusOf([a.id], "INACTIVE") } : { label: "Activate", icon: <Check />, onClick: () => setStatusOf([a.id], "ACTIVE") });
    if (can.remove) items.push({ label: "Delete", icon: <Trash2 />, danger: true, onClick: () => setDel(a) });
    setMenu({ anchor, items });
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  if (error) return <div className="coa"><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div>;

  const kpis = [1, 2, 3, 4, 5].map((c) => {
    const root = (kids.get(null) ?? []).find((r) => r.accountClass === c);
    return { c, value: root ? bal(root) : 0, postable: all.filter((a) => a.accountClass === c && a.level === 4).length };
  });
  const sortCls = (k: string) => cn("sort", sort.key === k && (sort.dir === 1 ? "asc" : "desc"));
  const blockers = del ? [
    ...((kids.get(del.id) ?? []).length ? [`It has ${(kids.get(del.id) ?? []).length} sub-account${(kids.get(del.id) ?? []).length > 1 ? "s" : ""}. Move or delete them first.`] : []),
    ...(bal(del) !== 0 ? ["It carries a balance. Transfer the balance to zero first."] : []),
  ] : [];
  const delPath = (a: Account) => {
    const out: string[] = [];
    for (let p = a.parentId ? byId.get(a.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) out.unshift(p.name);
    return out.join(" › ") || "Top level";
  };

  return (
    <div className="coa">
      <div className="coa-head">
        <div className="coa-title">
          <span className="coa-title-icon"><BookOpen /></span>
          <div>
            <h1>Chart of Accounts</h1>
            <p>Manage your chart of accounts and organize it into sub-accounts</p>
          </div>
        </div>
        <div className="coa-tools">
          <label className={cn("coa-search", q && "has")}>
            <Search />
            <input type="text" placeholder="Search accounts or codes…" aria-label="Search accounts" value={q} onChange={(e) => { setQ(e.target.value); setQClosed(new Set()); setPage(1); }} />
            <kbd>⌘ K</kbd>
            <button className="clr" type="button" aria-label="Clear search" onClick={() => setQ("")}><X /></button>
          </label>
          <label className="coa-select">
            <Filter />
            <select aria-label="Account class" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }}>
              <option value="all">All Accounts</option>
              {Object.entries(CLASS_UI).map(([c, u]) => <option key={c} value={c}>{u.name}</option>)}
            </select>
            <ChevronDown />
          </label>
          <button className="coa-btn" type="button" disabled={!all.length} onClick={() => exportCsv(rows.map((r) => r.a))}><Download />Export</button>
          {can.create && (
            <div className="coa-split">
              <button className="coa-btn primary" type="button" disabled={!all.length} onClick={() => setModal({ parentId: null })}><Plus />Add Account</button>
              <button
                className="coa-btn primary caret"
                type="button"
                aria-label="More add options"
                onClick={(e) => {
                  const anchor = e.currentTarget;
                  setMenu({
                    anchor,
                    items: [
                      { label: "Add account", icon: <Plus />, disabled: !all.length, onClick: () => setModal({ parentId: null }) },
                      ...templates.map((t) => ({ label: `Apply ${t.name}`, icon: <ListTree />, disabled: all.length > 0, onClick: () => apply(t) })),
                    ],
                  });
                }}
              >
                <ChevronDown />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="coa-stats">
        {kpis.map((k) => {
          const u = CLASS_UI[k.c]!;
          return (
            <article key={k.c} className={cn("coa-stat", u.tone)}>
              <span className="coa-stat-icon"><u.icon /></span>
              <small>{k.c === 1 ? "Total Assets" : u.name}{k.c >= 4 && <span style={{ color: "var(--muted-2)" }}> · YTD</span>}</small>
              <b className="v num">{accounts ? <Money value={k.value} /> : <Skeleton style={{ height: 22, width: 120 }} />}</b>
              <div className="coa-stat-foot"><em>{k.postable} postable accounts</em></div>
            </article>
          );
        })}
        <article className="coa-stat ct-green">
          <span className="coa-stat-icon"><ListTree /></span>
          <small>Total Accounts</small>
          <b className="v num">{accounts ? all.length : <Skeleton style={{ height: 22, width: 60 }} />}</b>
          <div className="coa-stat-foot"><em><b>{all.filter((a) => a.status === "ACTIVE").length}</b> active</em></div>
        </article>
      </div>

      <div className="coa-toolbar">
        <label className="coa-check big" title="Select all on this page">
          <input type="checkbox" aria-label="Select all visible" checked={pageRows.length > 0 && onPage === pageRows.length} ref={(el) => { if (el) el.indeterminate = onPage > 0 && onPage < pageRows.length; }} onChange={(e) => selectPage(e.target.checked)} />
          <i><Check /></i>
        </label>
        <b className={cn("coa-selcount", sel.size > 0 && "on")}>{sel.size} selected</b>
        <span className="coa-vsep" />
        <div className="coa-bulk">
          {can.edit && <button className="coa-btn" data-bulk="activate" type="button" title="Activate" disabled={!sel.size} onClick={() => setStatusOf([...sel], "ACTIVE")}><Check /><span className="lbl">Activate</span></button>}
          {can.edit && <button className="coa-btn" data-bulk="deactivate" type="button" title="Deactivate" disabled={!sel.size} onClick={() => setStatusOf([...sel], "INACTIVE")}><X /><span className="lbl">Deactivate</span></button>}
          <button className="coa-btn" data-bulk="export" type="button" title="Export selected" disabled={!sel.size} onClick={() => exportCsv(selected)}><Download /><span className="lbl">Export</span></button>
          {sel.size > 0 && <button className="coa-btn" type="button" onClick={() => setSel(new Set())}>Clear</button>}
        </div>
        <div className="coa-toolbar-right">
          <FilterSelect label="type" value={type} onChange={(v) => { setType(v); setPage(1); }} options={[["all", "All Types"], ["HEADER", "Header"], ["GROUP", "Group"], ["POSTABLE", "Postable"]]} />
          <FilterSelect label="status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[["all", "All Statuses"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"]]} />
          <FilterSelect label="level" value={level} onChange={(v) => { setLevel(v); setPage(1); }} options={[["all", "All Levels"], ["1", "Level 1"], ["2", "Level 2"], ["3", "Level 3"], ["4", "Level 4"]]} />
          <button className="coa-btn" type="button" onClick={resetFilters}>Reset</button>
          <div className="coa-seg icons" aria-label="Density">
            <button type="button" className={cn(density === "list" && "active")} title="Compact" onClick={() => setDensity("list")}><List /></button>
            <button type="button" className={cn(density === "comfy" && "active")} title="Comfortable" onClick={() => setDensity("comfy")}><ListTree /></button>
            <button type="button" className={cn(density === "grid" && "active")} title="Spacious" onClick={() => setDensity("grid")}><LayoutGrid /></button>
          </div>
        </div>
      </div>

      <div className="coa-views">
        <div className="coa-view">
          <section className={cn("coa-table", `d-${density}`)}>
            <div className="coa-scroll">
              <div className="coa-grid" role="treegrid" aria-label="Chart of accounts">
                <div className="coa-tr head" role="row">
                  <span className="c-check">
                    <label className="coa-check"><input type="checkbox" aria-label="Select page" checked={pageRows.length > 0 && onPage === pageRows.length} onChange={(e) => selectPage(e.target.checked)} /><i><Check /></i></label>
                  </span>
                  <span className={cn("c-name", sortCls("name"))} onClick={() => sortBy("name")}>Account Name <ArrowUpDown className="si" /></span>
                  <span className={sortCls("code")} onClick={() => sortBy("code")}><Tag />Code <ArrowUpDown className="si" /></span>
                  <span className="c-type"><Filter />Type</span>
                  <span className="c-parent"><FolderTree />Parent Account</span>
                  <span className="c-subs"><Network /><span className="full">Sub-accounts</span><span className="short">Sub-accts</span></span>
                  <span className={cn("num", sortCls("bal"))} onClick={() => sortBy("bal")}><Coins />Balance (PKR) <ArrowUpDown className="si" /></span>
                  <span><TrendingUp />Change</span>
                  <span><CalendarDays />Last Modified</span>
                  <span><Activity />Status</span>
                  <span className="c-actions">Actions</span>
                </div>
                <div className="coa-body" role="rowgroup">
                  {!accounts && Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="coa-tr" style={{ padding: "0 14px", alignItems: "center", display: "flex" }}><Skeleton style={{ height: 18, width: "100%" }} /></div>
                  ))}
                  {accounts && !all.length && <EmptyChart templates={templates} canCreate={can.create} busy={busy} onApply={apply} />}
                  {accounts && all.length > 0 && !rows.length && (
                    <div className="coa-empty">
                      <span className="coa-stat-icon ct-grey"><Search /></span>
                      <b>No accounts match</b>Try a different code or name, or reset the filters.
                      <div style={{ marginTop: 12 }}><button className="coa-btn" type="button" style={{ display: "inline-flex" }} onClick={resetFilters}>Reset filters</button></div>
                    </div>
                  )}
                  {pageRows.map((r) => (
                    <AccountRow
                      key={r.a.id}
                      r={r}
                      q={q.trim()}
                      parent={r.a.parentId ? (byId.get(r.a.parentId) ?? null) : null}
                      balance={bal(r.a)}
                      selected={sel.has(r.a.id)}
                      flash={flash === r.a.id}
                      onToggle={() => toggle(r)}
                      onSelect={() => toggleSel(r.a.id)}
                      onMenu={(el) => rowMenu(el, r.a)}
                      onOpen={() => (can.edit ? setModal({ edit: r.a }) : setHistory(r.a))}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="coa-foot">
              <span>Showing <b>{rows.length ? (pg - 1) * per + 1 : 0}–{Math.min(rows.length, pg * per)}</b> of <b>{rows.length}</b> rows · {all.length} accounts</span>
              <div className="coa-foot-right">
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button className="coa-btn" type="button" style={{ height: 30, padding: "0 10px" }} onClick={() => { setOpen(new Set(all.filter((a) => a.level < 4).map((a) => a.code))); setQClosed(new Set()); }}><ChevronDown />Expand all</button>
                  <button className="coa-btn" type="button" style={{ height: 30, padding: "0 10px" }} onClick={() => { setOpen(new Set()); setQClosed(new Set(all.map((a) => a.id))); setPage(1); }}><ChevronRight />Collapse all</button>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Rows per page
                  <label className="coa-select">
                    <select aria-label="Rows per page" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}>
                      {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
                    </select>
                    <ChevronDown />
                  </label>
                </span>
                <Pager page={pg} pages={pages} onPage={setPage} />
                <label className="coa-goto">Go to page <input type="number" min={1} max={pages} value={pg} aria-label="Go to page" onChange={(e) => setPage(Math.max(1, Math.min(pages, Number(e.target.value) || 1)))} /></label>
              </div>
            </div>
          </section>
        </div>
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      <AccountModal mode={modal} accounts={all} retiredCodes={retired} lookups={lookups} onClose={() => setModal(null)} onSaved={saved} />

      <Modal
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete account?"
        subtitle={blockers.length ? "Deletion is blocked for this account" : "This removes the account from the chart."}
        foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setDel(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn danger" onClick={remove} disabled={busy || blockers.length > 0}><Trash2 />{busy ? "Deleting…" : "Delete account"}</button>
          </>
        }
      >
        {del && (
          <>
            <div className={cn("coa-del-acc", CLASS_UI[del.accountClass]?.tone)}>
              <span className={cn("coa-icon", CLASS_UI[del.accountClass]?.tone)}><AccountIcon account={del} /></span>
              <div><b>{del.name}</b><small>{del.code} · {kindLabel(del.kind)} · {delPath(del)}</small></div>
            </div>
            {blockers.length ? (
              <div className="coa-block">
                <TriangleAlert />
                <div><b>This account can’t be deleted</b>Accounts are protected while they hold data:<ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>
              </div>
            ) : <p className="coa-del-ok">The account has no sub-accounts and a zero balance, so it can be removed. Accounts with posted entries are refused; deactivate those instead.</p>}
          </>
        )}
      </Modal>

      <Drawer open={!!history} onClose={() => setHistory(null)} title={history ? `${history.code} · ${history.name}` : "History"} subtitle="Every change to this account, with who made it">
        {history && <HistoryTab schema="Accounting" table="ChartOfAccounts" id={history.id} />}
      </Drawer>
    </div>
  );
}

function AccountRow({ r, q, parent, balance, selected, flash, onToggle, onSelect, onMenu, onOpen }: {
  r: Row; q: string; parent: Account | null; balance: number; selected: boolean; flash: boolean;
  onToggle: () => void; onSelect: () => void; onMenu: (el: HTMLElement) => void; onOpen: () => void;
}) {
  const a = r.a, d = r.depth, kind = kindLabel(a.kind);
  const guides = [];
  for (let k = 0; k <= d - 2; k++) {
    const x = 10 + k * STEP + 13;
    if (k === d - 2) guides.push(<i key={k} className={cn("coa-guide elbow", r.last && "end")} style={{ left: x }} />);
    else if (!r.lasts[k + 1]) guides.push(<i key={k} className="coa-guide" style={{ left: x }} />);
  }
  return (
    <div
      role="row"
      aria-level={d}
      aria-expanded={r.kc ? r.open : undefined}
      aria-selected={selected}
      className={cn("coa-tr", `lv${a.level}`, CLASS_UI[a.accountClass]?.tone, a.level === 1 && "root", r.ctx && "ctx", a.status !== "ACTIVE" && "inactive", r.open && "open", selected && "sel", flash && "flash")}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button,label,a")) return;
        if (r.kc) onToggle();
        else onOpen();
      }}
      onDoubleClick={onOpen}
    >
      <span className="c-check" role="gridcell"><label className="coa-check"><input type="checkbox" aria-label={`Select ${a.name}`} checked={selected} onChange={onSelect} /><i><Check /></i></label></span>
      <span className="c-name" role="gridcell" style={{ paddingLeft: 10 + (d - 1) * STEP }}>
        {guides}
        {r.kc ? <button className="tw" type="button" tabIndex={-1} aria-label={`Toggle ${a.name}`} onClick={onToggle}><ChevronRight /></button> : <i className="coa-nochev" />}
        <span className="coa-icon"><AccountIcon account={a} /></span>
        <span className="coa-name"><b title={a.name}><Hl text={a.name} q={q} /></b><small>{a.description ?? ""}</small></span>
      </span>
      <span className="c-code" role="gridcell"><Hl text={a.code} q={q} /></span>
      <span role="gridcell"><span className={cn("coa-kind", kind.toLowerCase())}>{kind}</span></span>
      <span className={cn("c-parent", !parent && "none")} role="gridcell">{parent ? <em>{parent.name} ({parent.code})</em> : "—"}</span>
      <span role="gridcell"><span className={cn("coa-count", r.kc > 0 && "on")}>{r.kc}</span></span>
      <span className={cn("num c-balance", balance === 0 && "zero")} role="gridcell"><span><Money value={balance} /></span></span>
      <span className="c-change flat" role="gridcell"><em>● 0.0%</em><i className="coa-flat" /></span>
      <span className="c-mod" role="gridcell"><b>{dateLabel(a.updatedAt)}</b><small>by {a.updatedByName ?? "system"}</small></span>
      <span role="gridcell"><span className={cn("coa-status", a.status === "ACTIVE" ? "on" : "off")}>{a.status === "ACTIVE" ? "Active" : "Inactive"}</span></span>
      <span className="c-actions" role="gridcell">
        <button type="button" tabIndex={-1} aria-label={`Actions for ${a.name}`} onClick={(e) => onMenu(e.currentTarget)}><EllipsisVertical /></button>
      </span>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="coa-select">
      <select aria-label={`${label} filter`} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown />
    </label>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const list: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) if (i === 1 || i === pages || Math.abs(i - page) <= 1) list.push(i); else if (list[list.length - 1] !== "…") list.push("…");
  const b = (p: number, label: ReactNode, dis: boolean, key: string, act = false) => (
    <button key={key} type="button" disabled={dis} className={cn(act && "active")} aria-current={act ? "page" : undefined} onClick={() => onPage(p)}>{label}</button>
  );
  return (
    <div className="coa-pager">
      {b(1, "«", page === 1, "first")}
      {b(page - 1, <ChevronLeft />, page === 1, "prev")}
      {list.map((x, i) => (x === "…" ? <span key={`g${i}`} className="gap">…</span> : b(x, x, false, `p${x}`, x === page)))}
      {b(page + 1, <ChevronRight />, page === pages, "next")}
      {b(pages, "»", page === pages, "last")}
    </div>
  );
}

/** No accounts yet: offer the standard chart (Platform.ChartOfAccountsTemplates) in one click. */
function EmptyChart({ templates, canCreate, busy, onApply }: { templates: AccountTemplate[]; canCreate: boolean; busy: boolean; onApply: (t: AccountTemplate) => void }) {
  return (
    <div className="coa-empty">
      <span className="coa-stat-icon ct-green"><ListTree /></span>
      <b>Your chart of accounts is empty</b>
      {canCreate ? "Start from the standard chart, then rename, add or deactivate accounts to fit your business." : "Ask an administrator to set up the chart of accounts."}
      {canCreate && templates.map((t) => (
        <div key={t.id} style={{ marginTop: 14 }}>
          <button className="coa-btn primary" type="button" style={{ display: "inline-flex" }} disabled={busy} onClick={() => onApply(t)}>
            <FileText />
            {busy ? "Creating accounts…" : `Apply ${t.name}`}
          </button>
          <div style={{ marginTop: 6, fontSize: 12 }}>{t.accountCount} accounts · {t.postableCount} postable{t.description ? ` · ${t.description}` : ""}</div>
        </div>
      ))}
      {!canCreate && <div style={{ marginTop: 12 }}><Link className="coa-btn" href="/dashboard" style={{ display: "inline-flex" }}>Back to dashboard</Link></div>}
    </div>
  );
}
