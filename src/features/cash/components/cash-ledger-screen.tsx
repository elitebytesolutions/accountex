"use client";

import "./cash-ledger-screen.css";
import {
  ArrowDown, ArrowDownLeft, ArrowUp, ArrowUpRight, Banknote, Calculator, Coins, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, Download, FileText,
  Flag, GitCommitVertical, Info, ListOrdered, Lock, LockKeyhole, LockKeyholeOpen, LockOpen, Minus, MoreVertical, Plus, Printer, Search, SearchX, Sigma, Table2, Tags,
  UserRoundCheck, Wallet, X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CashLedger, CashLedgerRow, CashOptions, Voucher } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { ErrorState } from "@/components/ui/states";
import { dateLabel, downloadCsv, Money } from "@/features/finance/components/finance-ui";
import { getVoucher } from "@/features/ledger/api";
import { ApiError } from "@/lib/api/errors";
import { cashLedger, cashOptions } from "../api";
import { addDays, compact, dMon, dow, errMsg, grp, MON, NOTES, rs, today, useCashDay, WDL, WDS } from "./cash-ui";

type Preset = "today" | "week" | "month" | "custom";
type View = "table" | "timeline" | "heat";
type Row = CashLedgerRow & { key: string; dir: "in" | "out"; amt: number };
const PER = 18;
const NOTE_TONE: Record<number, string> = { 5000: "olive", 1000: "blue", 500: "green", 100: "red", 50: "violet", 20: "orange", 10: "brown" };
const PALETTE = ["#16a34a", "#2563eb", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#ca8a04", "#db2777", "#4b5563", "#65a30d"];
const TILE = ["", "orange", "blue", "violet"];
const vt = (r: CashLedgerRow) => r.voucher?.voucherType ?? "JV";
const s = (n: number) => `${Math.abs(n) < 0.005 ? "" : n < 0 ? "−" : ""}Rs ${grp(n)}`;

function presetRange(p: Preset): [string, string] {
  const t = today();
  if (p === "today") return [t, t];
  if (p === "week") { const back = (dow(t) + 6) % 7; return [addDays(t, -back), t]; }
  if (p === "month") return [`${t.slice(0, 8)}01`, t];
  return [addDays(t, -13), t];
}

/** Template app/cash/ledger (49-cash-users.html + 9E-cash-users.js ledgerMount … bindLedger): per-drawer running ledger, day close, variance trend, categories. */
export function CashLedgerScreen({ can }: { can: { create: boolean; post: boolean; approve: boolean } }) {
  const router = useRouter();
  const [options, setOptions] = useState<CashOptions | null>(null);
  const [ledger, setLedger] = useState<CashLedger | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [acct, setAcct] = useState("");
  const [preset, setPreset] = useState<Preset>("custom");
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange("custom"));
  const [view, setView] = useState<View>("table");
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [vtype, setVtype] = useState("all");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [cats, setCats] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [day, setDay] = useState(today);
  const [donut, setDonut] = useState<"in" | "out">("out");
  const [drawn, setDrawn] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [vid, setVid] = useState<string | null>(null);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [vErr, setVErr] = useState<string | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);

  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });
  const loadOptions = useCallback(() => cashOptions().then((o) => {
    setOptions(o);
    setAcct((a) => a || (o.cashAccounts.find((c) => c.kind !== "PETTY" && c.kind !== "IMPREST") ?? o.cashAccounts[0])?.id || "");
  }), []);
  useEffect(() => { loadOptions().catch((e: unknown) => fail(e, "Could not load cash accounts")); }, [loadOptions, attempt]);
  const loadLedger = useCallback(() => (acct ? cashLedger({ account: acct, from, to }).then((l) => { setLedger(l); setError(null); }) : Promise.resolve()), [acct, from, to]);
  useEffect(() => { loadLedger().catch((e: unknown) => fail(e, "Could not load the cash ledger")); }, [loadLedger, attempt]);
  const refresh = useCallback(() => { void loadOptions(); void loadLedger(); }, [loadOptions, loadLedger]);
  const dc = useCashDay(acct, day, refresh);

  useEffect(() => {
    setDrawn(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(id);
  }, [ledger, donut]);
  useEffect(() => {
    if (!vid) return;
    let live = true;
    getVoucher(vid).then((v) => live && setVoucher(v)).catch((e: unknown) => live && setVErr(errMsg(e, "Could not load the voucher")));
    return () => { live = false; };
  }, [vid]);

  // ---------------------------------------------------------------- derived
  const all = useMemo<Row[]>(() => [...(ledger?.days ?? [])].reverse().flatMap((d) => d.rows.map((r, i) => ({ ...r, key: `${r.voucher?.id ?? d.date}-${i}`, dir: r.receipt > 0 ? "in" as const : "out" as const, amt: r.receipt || r.payment }))), [ledger]);
  const catColor = useMemo(() => {
    const m = new Map<string, string>();
    [...new Set(all.map((r) => r.category ?? "Uncategorised"))].forEach((c, i) => m.set(c, PALETTE[i % PALETTE.length]!));
    return m;
  }, [all]);
  const catOf = (r: CashLedgerRow) => r.category ?? "Uncategorised";
  const filtersOn = !!q.trim() || dir !== "all" || vtype !== "all" || !!min || !!max || cats.size > 0;
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase(), lo = Number(min) || 0, hi = Number(max) || Infinity;
    return all.filter((r) => (dir === "all" || r.dir === dir) && (vtype === "all" || vt(r) === vtype) && r.amt >= lo && r.amt <= hi
      && (!cats.size || cats.has(catOf(r)))
      && (!t || [r.voucher?.docNo, r.particulars, r.narration, r.contra?.name, r.category, String(r.amt)].join(" ").toLowerCase().includes(t)));
  }, [all, q, dir, vtype, min, max, cats]);
  const types = useMemo(() => [...new Set(all.map(vt))].sort(), [all]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(catOf(r), (m.get(catOf(r)) ?? 0) + 1);
    return [...m.entries()];
  }, [all]);
  const dayInfo = useMemo(() => new Map((ledger?.days ?? []).map((d) => [d.date, d])), [ledger]);
  const closingOf = (d: string) => {
    const hit = (ledger?.days ?? []).find((x) => x.date <= d);
    return hit ? hit.closing : ledger?.opening ?? 0;
  };
  const tin = rows.filter((r) => r.dir === "in").reduce((a, r) => a + r.amt, 0), tout = rows.filter((r) => r.dir === "out").reduce((a, r) => a + r.amt, 0);
  const nIn = rows.filter((r) => r.dir === "in").length, nOut = rows.length - nIn;
  const account = options?.cashAccounts.find((c) => c.id === acct) ?? null;
  const tol = ledger?.account.varianceTolerance ?? account?.varianceTolerance ?? 0;

  const choosePreset = (p: Preset) => { setPreset(p); if (p !== "custom") setRange(presetRange(p)); setPage(1); };
  const clearFilters = () => { setQ(""); setDir("all"); setVtype("all"); setMin(""); setMax(""); setCats(new Set()); setPage(1); };
  const toggleCat = (c: string) => { setCats((x) => { const n = new Set(x); if (n.has(c)) n.delete(c); else n.add(c); return n; }); setPage(1); };
  const openVoucher = (id: string) => { setVoucher(null); setVErr(null); setVid(id); };
  const rowMenu = (r: CashLedgerRow): MenuItem[] => r.voucher ? [
    { label: "View voucher", icon: <FileText />, onClick: () => openVoucher(r.voucher!.id) },
    { label: "Open in Vouchers", icon: <ArrowUpRight />, onClick: () => router.push(`/accounting/vouchers/${r.voucher!.id}`) },
    { sep: true },
    { label: `Day close · ${dMon(r.date)}`, icon: <Calculator />, onClick: () => setDay(r.date) },
  ] : [{ label: `Day close · ${dMon(r.date)}`, icon: <Calculator />, onClick: () => setDay(r.date) }];
  const exportCsv = () => {
    if (!ledger) return;
    downloadCsv(`cash-ledger-${ledger.account.code}-${from}-${to}.csv`, [
      ["Date", "Voucher", "Type", "Particulars", "Contra", "Category", "Receipt", "Payment", "Balance", "Narration"],
      ["", "", "", "Balance brought forward", "", "", null, null, ledger.opening, ""],
      ...rows.map((r) => [r.date, r.voucher?.docNo ?? "", vt(r), r.particulars, r.contra ? `${r.contra.code} ${r.contra.name}` : "", r.category ?? "", r.receipt || null, r.payment || null, r.balance, r.narration ?? ""]),
    ]);
  };

  if (error && !ledger) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;

  // ---------------------------------------------------------------- views
  const table = () => {
    const pages = Math.max(1, Math.ceil(rows.length / PER)), pg = Math.min(page, pages);
    const slice = rows.slice((pg - 1) * PER, pg * PER);
    const first = slice[0];
    const bf = first ? first.balance - (first.receipt - first.payment) : ledger?.opening ?? 0;
    const bfDate = pg === 1 || !first ? from : first.date;
    const groups: { date: string; rows: Row[] }[] = [];
    for (const r of slice) { const g = groups[groups.length - 1]; if (g && g.date === r.date) g.rows.push(r); else groups.push({ date: r.date, rows: [r] }); }
    const pin = slice.filter((r) => r.dir === "in").reduce((a, r) => a + r.amt, 0), pout = slice.filter((r) => r.dir === "out").reduce((a, r) => a + r.amt, 0);
    const last = pg === pages, end = slice.length ? slice[slice.length - 1]!.balance : bf;
    let k = 0;
    return (<>
      <div className="al-table cu-lt"><table>
        <thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th className="cu-ccol">Category</th><th className="num">Receipt</th><th className="num">Payment</th><th className="num">Balance</th><th /></tr></thead>
        <tbody>
          <tr className="bf"><td className="date"><b>{dMon(bfDate)}</b><small>{WDS[dow(bfDate)]}</small></td><td colSpan={2}><span className="al-ref">Balance brought forward</span><small className="cu-muted">{pg === 1 ? "Opening balance for the period" : `Carried from page ${pg - 1}`}</small></td><td className="cu-ccol" /><td className="num" /><td className="num" /><td className="num bal"><Money value={bf} /><small>Dr</small></td><td className="ctr" /></tr>
          {!slice.length && <tr className="al-none"><td colSpan={8}><div className="empty-state"><span className="icon-well lg"><SearchX /></span><h4>No entries match</h4><p>Try widening the period or clearing filters.</p>{filtersOn && <button type="button" className="btn secondary sm" onClick={clearFilters}><X />Clear filters</button>}</div></td></tr>}
          {groups.flatMap((g) => {
            const locked = dayInfo.get(g.date)?.close?.status === "LOCKED";
            const din = g.rows.filter((r) => r.dir === "in").reduce((a, r) => a + r.amt, 0), dout = g.rows.filter((r) => r.dir === "out").reduce((a, r) => a + r.amt, 0);
            return [
              ...g.rows.map((r) => {
                const c = catOf(r), cc = { ["--cc" as string]: catColor.get(c) } as CSSProperties;
                return (
                  <tr key={r.key} className={cn("in cu-row", r.dir, locked && "cu-locked")} style={{ ["--i" as string]: Math.min(k++, 24) }} tabIndex={0} onClick={() => r.voucher && openVoucher(r.voucher.id)}>
                    <td className="date"><b>{dMon(r.date)}{locked && <Lock className="cu-lk" />}</b><small>{WDS[dow(r.date)]}</small></td>
                    <td><span className="al-ref">{r.voucher?.docNo ?? "—"}</span><span className={cn("al-type", vt(r).toLowerCase())}>{vt(r)}</span></td>
                    <td className="part"><b>{r.narration ?? r.particulars}</b><small>{r.dir === "in" ? "To" : "By"} {r.contra ? `${r.contra.code} · ${r.contra.name}` : r.particulars}</small><span className="cu-cat cu-cat-inl" style={cc}><i />{c}</span></td>
                    <td className="cu-ccol"><span className="cu-cat" style={cc}><i />{c}</span></td>
                    <td className="num dr">{r.dir === "in" ? <Money value={r.amt} /> : <i>—</i>}</td>
                    <td className="num cr">{r.dir === "out" ? <Money value={r.amt} /> : <i>—</i>}</td>
                    <td className="num bal"><Money value={r.balance} /><small>Dr</small></td>
                    <td className="ctr"><button type="button" className="al-dots" aria-label="Row actions" onClick={(e) => { e.stopPropagation(); setMenu({ anchor: e.currentTarget, items: rowMenu(r) }); }}><MoreVertical /></button></td>
                  </tr>
                );
              }),
              <tr key={`sub-${g.date}`} className={cn("cu-sub", day === g.date && "sel")} style={{ ["--i" as string]: Math.min(k++, 24) }} onClick={() => setDay(g.date)}>
                <td colSpan={3}><span className="cu-sub-l">{locked ? <Lock /> : <Sigma />}Day total · {WDS[dow(g.date)]} {dMon(g.date)}<em>{g.rows.length} {g.rows.length === 1 ? "entry" : "entries"}</em>{locked ? <span className="cu-sub-lock">Closed</span> : <span className="cu-sub-open">Open</span>}</span></td>
                <td className="cu-ccol" /><td className="num dr">{din ? <Money value={din} /> : <i>—</i>}</td><td className="num cr">{dout ? <Money value={dout} /> : <i>—</i>}</td>
                <td className="num bal"><Money value={g.rows[g.rows.length - 1]!.balance} /><small>Dr</small></td><td className="ctr" />
              </tr>,
            ];
          })}
        </tbody>
        {!!slice.length && <tfoot>
          <tr className="cu-ptot"><td colSpan={3}>Page total <small>{slice.length} entries</small></td><td className="cu-ccol" /><td className="num dr"><Money value={pin} /></td><td className="num cr"><Money value={pout} /></td><td className="num" /><td /></tr>
          <tr className="cu-end"><td colSpan={3}>{last ? (filtersOn ? "Balance after last shown entry" : "Closing balance carried down") : "Balance carried forward"} <small>{last ? `as of ${dMon(to)}` : `to page ${pg + 1}`}</small></td><td className="cu-ccol" /><td className="num" /><td className="num" /><td className="num bal"><Money value={last && !filtersOn ? ledger?.closing ?? end : end} /><small>Dr</small></td><td /></tr>
        </tfoot>}
      </table></div>
      <div className="cu-lfoot"><span><Info />{rows.length ? `Showing ${(pg - 1) * PER + 1}–${(pg - 1) * PER + slice.length} of ${rows.length}` : "No entries"} · balance column always reflects the full ledger</span>
        {pages > 1 && <div className="cu-pager"><button type="button" disabled={pg === 1} aria-label="Previous page" onClick={() => setPage(pg - 1)}><ChevronLeft /></button>
          {Array.from({ length: pages }, (_, p) => <button key={p} type="button" className={cn(p + 1 === pg && "active")} onClick={() => setPage(p + 1)}>{p + 1}</button>)}
          <button type="button" disabled={pg === pages} aria-label="Next page" onClick={() => setPage(pg + 1)}><ChevronRight /></button></div>}
      </div>
    </>);
  };

  const timeline = () => {
    if (!rows.length) return <div className="empty-state"><span className="icon-well lg"><CalendarDays /></span><h4>Nothing in this period</h4><p>Adjust the date range or filters.</p></div>;
    const days = [...new Set(rows.map((r) => r.date))].sort().reverse();
    return (
      <div className="cu-tl">{days.map((d, k) => {
        const g = rows.filter((r) => r.date === d), info = dayInfo.get(d), locked = info?.close?.status === "LOCKED";
        const din = g.filter((r) => r.dir === "in").reduce((a, r) => a + r.amt, 0), dout = g.filter((r) => r.dir === "out").reduce((a, r) => a + r.amt, 0);
        return (
          <section key={d} className={cn("cu-tl-day", locked && "locked", day === d && "sel")} style={{ ["--i" as string]: Math.min(k, 14) }}>
            <div className="cu-tl-node"><b>{d.slice(8)}</b><small>{MON[Number(d.slice(5, 7)) - 1]}</small></div>
            <div className="cu-tl-card">
              <header onClick={() => setDay(d)}><div><h4>{WDL[dow(d)]}{d === today() && <> <span className="badge lime">Today</span></>}</h4><small>{g.length} {g.length === 1 ? "entry" : "entries"} · day closing {s(info?.closing ?? closingOf(d))}</small></div>
                <span className="cu-tl-sum"><span className="in">+{s(din)}</span><span className="out">−{s(dout)}</span></span>
                {locked ? <span className="cu-tl-lock" title="Day closed"><Lock /></span> : <span className="cu-tl-open" title="Day still open"><LockOpen /></span>}</header>
              <ul>{g.map((r) => (
                <li key={r.key} tabIndex={0} onClick={() => r.voucher && openVoucher(r.voucher.id)}>
                  <time>{WDS[dow(r.date)]}</time><span className="cu-ic" style={{ ["--cc" as string]: catColor.get(catOf(r)) }}>{r.dir === "in" ? <ArrowDownLeft /> : <ArrowUpRight />}</span>
                  <div><b>{r.narration ?? r.particulars}</b><small><span className={cn("al-type", vt(r).toLowerCase())}>{vt(r)}</span>{r.voucher?.docNo} · {r.dir === "in" ? "To" : "By"} {r.contra?.name ?? r.particulars}</small></div>
                  <strong className={r.dir}>{r.dir === "in" ? "+" : "−"}{s(r.amt)}</strong>
                </li>))}</ul>
            </div>
          </section>
        );
      })}</div>
    );
  };

  const heat = () => {
    const per = new Map<string, { i: number; o: number; n: number }>();
    for (const r of rows) { const p = per.get(r.date) ?? { i: 0, o: 0, n: 0 }; if (r.dir === "in") p.i += r.amt; else p.o += r.amt; p.n++; per.set(r.date, p); }
    const mx = Math.max(1, ...[...per.values()].map((p) => Math.abs(p.i - p.o)));
    let st = from; while (dow(st) !== 1) st = addDays(st, -1);
    let en = to; while (dow(en) !== 0) en = addDays(en, 1);
    const cells = [];
    for (let d = st, k = 0; d <= en && k < 140; d = addDays(d, 1), k++) {
      const lbl = `${Number(d.slice(8))}${d.slice(8) === "01" ? ` ${MON[Number(d.slice(5, 7)) - 1]}` : ""}`;
      const p = per.get(d), lk = dayInfo.get(d)?.close?.status === "LOCKED";
      if (d < from || d > to) { cells.push(<div key={d} className="cu-hm-c out" style={{ ["--i" as string]: k }}><span>{lbl}</span></div>); continue; }
      if (!p) { cells.push(<div key={d} className={cn("cu-hm-c none", day === d && "sel")} style={{ ["--i" as string]: k }} title={`${WDS[dow(d)]} ${dMon(d)} · no entries`} onClick={() => setDay(d)}><span>{lbl}</span><em>—</em></div>); continue; }
      const net = p.i - p.o, pct = Math.round(14 + (Math.abs(net) / mx) * 70);
      cells.push(
        <div key={d} className={cn("cu-hm-c", net >= 0 ? "pos" : "neg", pct > 55 && "hot", day === d && "sel")} style={{ ["--hp" as string]: `${pct}%`, ["--i" as string]: k }} tabIndex={0} onClick={() => setDay(d)}
          title={`${WDS[dow(d)]} ${dMon(d)} · In ${s(p.i)} · Out ${s(p.o)} · Net ${compact(net)} · ${p.n} txns`}>
          <span>{lbl}{lk && <Lock />}</span><em>{compact(net)}</em><small><i style={{ ["--w" as string]: `${Math.round((p.i / (p.i + p.o || 1)) * 100)}%` }} /></small>
        </div>,
      );
    }
    const ds = [...per.keys()].sort((a, b) => (per.get(b)!.i - per.get(b)!.o) - (per.get(a)!.i - per.get(a)!.o));
    const net = (d: string) => per.get(d)!.i - per.get(d)!.o;
    const avg = ds.length ? ds.reduce((a, d) => a + net(d), 0) / ds.length : 0;
    return (
      <div className="cu-hm">
        <div className="cu-hm-head">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <span key={w}>{w}</span>)}</div>
        <div className="cu-hm-grid">{cells}</div>
        <div className="cu-hm-foot">
          <div className="cu-hm-legend"><span>More out</span><i className="neg" /><i className="neg2" /><i className="mid" /><i className="pos2" /><i className="pos" /><span>More in</span></div>
          <div className="cu-hm-stats">{ds.length ? (<>
            <span><small>Best day</small><b className="up">{dMon(ds[0]!)} · {compact(net(ds[0]!))}</b></span>
            <span><small>Heaviest outflow</small><b className="down">{dMon(ds[ds.length - 1]!)} · {compact(net(ds[ds.length - 1]!))}</b></span>
            <span><small>Avg daily net</small><b>{compact(avg)}</b></span></>) : <span><small>No entries in range</small></span>}</div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- rail
  const dcDays = (() => {
    const out: string[] = [];
    for (let d = to; d >= from && out.length < 62; d = addDays(d, -1)) out.push(d);
    if (!out.includes(day)) out.unshift(day);
    return out;
  })();
  const v = dc.variance, w = v === 0 ? 0 : Math.max(2, Math.min(1, Math.abs(v) / Math.max(1, tol || 1000)) * 50);
  const vtDays = Array.from({ length: 14 }, (_, i) => addDays(to, i - 13));
  const vtVals = vtDays.map((d) => { const c = dayInfo.get(d)?.close; return c && c.status === "LOCKED" ? c.varianceAmount : null; });
  const closed = vtVals.filter((x): x is number => x !== null), vNet = closed.reduce((a, x) => a + x, 0), vMax = Math.max(300, ...closed.map(Math.abs));
  const dnRows = rows.filter((r) => r.dir === donut);
  const dnList = [...dnRows.reduce((m, r) => m.set(catOf(r), (m.get(catOf(r)) ?? 0) + r.amt), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]);
  const dnTot = dnList.reduce((a, x) => a + x[1], 0), C = 2 * Math.PI * 42;
  let off = 0;
  const diff = (ledger?.closing ?? 0) - (ledger?.opening ?? 0);

  return (
    <div className="cu-page">
      <div className="page-head cu-head">
        <div><div className="eyebrow">Finance / Cash</div><h1>Cash Ledger</h1><p>Running balance of every drawer, counter and imprest — with day close, denominations and a full audit trail.</p></div>
        <div className="cu-head-r">
          <span className="tagline">Every rupee, accounted for</span>
          <div className="head-actions">
            <button type="button" className="btn secondary" onClick={exportCsv} disabled={!ledger}><Download />Export<ChevronDown className="cu-cv" /></button>
            <button type="button" className="btn secondary" onClick={() => window.print()}><Printer />Print</button>
            <button type="button" className="btn primary" disabled={!can.post} onClick={() => { setDay(today()); document.querySelector(".cu-dc")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><LockKeyhole />Close Day</button>
          </div>
        </div>
      </div>
      <div className="cu-accts" role="tablist" aria-label="Cash accounts">
        {options?.cashAccounts.map((a, i) => {
          const custodian = a.custodianName;
          return (
            <button key={a.id} type="button" className={cn("cu-acct", a.id === acct && "active")} role="tab" aria-selected={a.id === acct} style={{ ["--i" as string]: i }} onClick={() => { setAcct(a.id); setPage(1); setCats(new Set()); }}>
              <span className="cu-acct-top"><span className={cn("icon-tile", TILE[i % 4])}>{a.kind === "PETTY" || a.kind === "IMPREST" ? <Wallet /> : <Banknote />}</span><span className="cu-acct-name"><b>{a.name}</b><small>{a.code}{a.kind ? ` · ${a.kind.toLowerCase()}` : ""}</small></span><span className="cu-acct-ck"><Check /></span></span>
              <span className="cu-acct-bal"><Money value={a.balance} /></span>
              <span className="cu-acct-foot"><small>{custodian ? `Custodian · ${custodian}` : "No custodian set"}</small></span>
            </button>
          );
        })}
      </div>
      <div className="cu-period">
        <div className="seg">{(["today", "week", "month", "custom"] as const).map((p) => <button key={p} type="button" className={cn(preset === p && "active")} onClick={() => choosePreset(p)}>{{ today: "Today", week: "This week", month: "This month", custom: "Custom" }[p]}</button>)}</div>
        <label className="cu-range"><CalendarRange />
          <input type="date" value={from} max={to} aria-label="From date" onChange={(e) => { if (e.target.value) { setRange([e.target.value, to]); setPreset("custom"); setPage(1); } }} /><span>→</span>
          <input type="date" value={to} min={from} max={today()} aria-label="To date" onChange={(e) => { if (e.target.value) { setRange([from, e.target.value]); setPreset("custom"); setPage(1); } }} /></label>
        <span className="spacer" />
        {ledger && <span className="pill cu-cust"><UserRoundCheck />Custodian <b>{ledger.account.custodian?.name ?? "not set"}</b><span className="cu-dot" />{ledger.account.name} · {ledger.account.code}</span>}
      </div>
      <div className="cu-kpis">
        <Kpi tone="neutral" icon={<Flag />} label="Opening balance" value={<Money value={ledger?.opening ?? 0} />} sub={`as of ${dMon(from)}`} />
        <Kpi tone="good" icon={<ArrowDownLeft />} label="Receipts (in)" value={<Money value={tin} />} sub={`${nIn} receipt${nIn === 1 ? "" : "s"}${filtersOn ? " · filtered" : ""}`} />
        <Kpi tone="bad" icon={<ArrowUpRight />} label="Payments (out)" value={<Money value={tout} />} sub={`${nOut} payment${nOut === 1 ? "" : "s"}${filtersOn ? " · filtered" : ""}`} />
        <Kpi tone="brand" icon={<Wallet />} label="Closing balance" value={<Money value={ledger?.closing ?? 0} />} sub={<><span className={diff >= 0 ? "up" : "down"}>{diff >= 0 ? <ArrowUp /> : <ArrowDown />}{s(Math.abs(diff))}</span> vs opening</>} />
        <Kpi tone="violet" icon={<ListOrdered />} label="Transactions" value={String(rows.length)} sub={rows.length ? `avg ${s((tin + tout) / rows.length)}` : "no entries"} />
      </div>
      <div className="cu-lg">
        <div className="panel flush cu-main">
          <div className="cu-main-head">
            <div><h3>{{ table: "Ledger", timeline: "Day timeline", heat: "Daily net flow" }[view]} <span>· {ledger?.account.name ?? account?.name ?? ""}</span></h3>
              <p>{dMon(from)} – {dMon(to)} {to.slice(0, 4)} · {rows.length} of {all.length} entries{filtersOn ? " (filtered)" : ""}</p></div>
            <div className="seg cu-views">
              {([["table", "Table", Table2], ["timeline", "Timeline", GitCommitVertical], ["heat", "Calendar heatmap", CalendarDays]] as const).map(([k, l, I]) => <button key={k} type="button" className={cn(view === k && "active")} onClick={() => setView(k)}><I />{l}</button>)}
            </div>
          </div>
          <div className="cu-filters">
            <label className="search-field cu-search"><Search /><input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search ref, party, particulars, amount…" aria-label="Search ledger" /></label>
            <div className="cu-dirs">{(["all", "in", "out"] as const).map((d) => <button key={d} type="button" className={cn(dir === d && "active")} onClick={() => { setDir(d); setPage(1); }}>{d === "in" ? <><ArrowDownLeft />In</> : d === "out" ? <><ArrowUpRight />Out</> : "All"}</button>)}</div>
            <label className="cu-fsel"><FileText /><select value={vtype} onChange={(e) => { setVtype(e.target.value); setPage(1); }} aria-label="Voucher type"><option value="all">All types</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <div className="cu-amt"><span>Rs</span><input type="number" min="0" placeholder="Min" value={min} onChange={(e) => { setMin(e.target.value); setPage(1); }} aria-label="Minimum amount" /><i /><input type="number" min="0" placeholder="Max" value={max} onChange={(e) => { setMax(e.target.value); setPage(1); }} aria-label="Maximum amount" /></div>
          </div>
          <div className="cu-catchips"><span className="cu-catlbl"><Tags />Categories</span>
            {catCounts.map(([c, n]) => <button key={c} type="button" className={cn("cu-catchip", cats.has(c) && "on")} style={{ ["--cc" as string]: catColor.get(c) }} aria-pressed={cats.has(c)} onClick={() => toggleCat(c)}><i className="d" />{c}<em>{n}</em></button>)}
            <button type="button" className="cu-clear" disabled={!filtersOn} onClick={clearFilters}><X />Clear all</button>
          </div>
          <div className="cu-view">{!ledger ? <div className="empty-state"><p>Loading the ledger…</p></div> : view === "table" ? table() : view === "timeline" ? timeline() : heat()}</div>
        </div>
        <aside className="cu-rail">
          <div className={cn("panel cu-dc", dc.locked && "locked")}>
            <div className="cu-dc-head"><span className="cu-dc-ic"><Calculator /></span><div><h3>Day Close</h3><p>{dc.locked ? `Closed by ${dc.day?.lockedBy?.name ?? "—"}${dc.day?.lockedAt ? ` at ${new Date(dc.day.lockedAt).toTimeString().slice(0, 5)}` : ""}` : "Count the drawer, then lock the day"}</p></div>
              <label className="cu-dc-day"><select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day to close">{dcDays.map((d) => <option key={d} value={d}>{WDS[dow(d)]} {dMon(d)}{dayInfo.get(d)?.close?.status === "LOCKED" ? " · closed" : " · open"}</option>)}</select><ChevronDown /></label></div>
            <div className="cu-dens">
              {NOTES.map((n) => <Den key={n} tone={NOTE_TONE[n]!} label={grp(n)} value={dc.counts[n] || 0} amt={n * (dc.counts[n] || 0)} disabled={dc.locked || !can.create} onChange={(x) => dc.setCount(n, x)} />)}
              <Den coin tone="coin" label="Coins" value={dc.counts.coins || 0} amt={dc.counts.coins || 0} disabled={dc.locked || !can.create} onChange={(x) => dc.setCount("coins", x)} />
            </div>
            <div className="cu-dc-sum">
              <div><small>Counted</small><b>{rs(dc.counted)}</b></div>
              <div><small>Book balance</small><b>{rs(dc.book)}</b></div>
              <div className={cn("cu-dc-var", v === 0 ? "ok" : v < 0 ? "short" : "over")}><small>{v === 0 ? "Balanced" : v < 0 ? "Short" : "Over"}</small><b>{v === 0 ? "Rs 0" : rs(v, true)}</b></div>
            </div>
            <div className={cn("cu-vbar", v === 0 ? "ok" : v < 0 ? "short" : "over")} style={{ ["--w" as string]: `${w}%` }}><i className="mid" /><i className="fill" /></div>
            <div className="cu-vbar-lbl"><span>Short</span><span>±{rs(tol)} tolerance</span><span>Over</span></div>
            {dc.locked ? (<>
              <button type="button" className="btn secondary block cu-lockbtn is-locked" disabled><LockSvg /><span>{dMon(day)} is locked</span></button>
              {can.approve && <button type="button" className="btn ghost block sm" style={{ marginTop: 8 }} disabled={dc.busy} onClick={() => void dc.reopen()}><LockKeyholeOpen />Reopen {dMon(day)}</button>}
            </>) : (<>
              {can.create && dc.dirty && <button type="button" className="btn secondary block sm" style={{ marginBottom: 8 }} disabled={dc.busy} onClick={() => void dc.save()}>Save count</button>}
              <button type="button" className="btn primary block cu-lockbtn" disabled={!can.post || dc.busy || !acct || day > today()} onClick={() => (v !== 0 ? setConfirmLock(true) : void dc.lock())}><LockSvg /><span>{dc.busy ? "Locking…" : `Lock ${dMon(day)}`}</span></button>
              {Math.abs(v) > tol && !can.approve && <p className="cu-muted" style={{ fontSize: 11.5, margin: "8px 0 0" }}>Beyond the ±{rs(tol)} tolerance, only someone with cash approval can lock this day.</p>}
            </>)}
            {dc.error && <p className="cu-muted" style={{ fontSize: 11.5, margin: "8px 0 0" }}>{dc.error}</p>}
          </div>
          <div className="panel cu-vtp">
            <div className="panel-head"><div><h3>Variance trend</h3><p>Over / short at close · last 14 days</p></div><span className={cn("badge", vNet < 0 ? "danger" : vNet > 0 ? "warn" : "good")}>{vNet === 0 ? "Net Rs 0" : rs(vNet, true)}</span></div>
            <div className="cu-vt">{vtDays.map((d, i) => {
              const x = vtVals[i] ?? null, cls = x === null ? "open" : x === 0 ? "zero" : x < 0 ? "short" : "over", h = x === null || x === 0 ? 0 : Math.max(8, (Math.abs(x) / vMax) * 100);
              return <div key={d} className={cn("cu-vt-col", cls)} style={{ ["--h" as string]: `${h}%`, ["--i" as string]: i }} title={x === null ? `${dMon(d)} · not closed yet` : `${dMon(d)} · ${x === 0 ? "balanced" : `${x < 0 ? "short" : "over"} ${rs(Math.abs(x))}`}`}><i /><small>{Number(d.slice(8))}</small></div>;
            })}</div>
            <div className="cu-vt-foot"><span><i className="k short" />Short</span><span><i className="k over" />Over</span><span><i className="k zero" />Exact</span><span className="spacer" /><b>{closed.filter((x) => x === 0).length}/{closed.length}</b>&nbsp;closed exact</div>
          </div>
          <div className={cn("panel cu-dn", drawn && "drawn")}>
            <div className="panel-head"><div><h3>Top categories</h3><p>{donut === "out" ? "Where the cash went" : "Where the cash came from"}</p></div>
              <div className="seg cu-mini-seg">{(["out", "in"] as const).map((d) => <button key={d} type="button" className={cn(donut === d && "active")} onClick={() => setDonut(d)}>{d === "out" ? "Out" : "In"}</button>)}</div></div>
            <div className="cu-dn-wrap"><svg className="cu-dn-svg" viewBox="0 0 120 120" aria-hidden="true"><circle className="cu-dn-track" r="42" cx="60" cy="60" />
              {dnList.map(([c, amt], i) => { const len = dnTot ? (amt / dnTot) * C : 0; const el = <circle key={c} className="cu-dn-seg" r="42" cx="60" cy="60" stroke={catColor.get(c)} style={{ ["--len" as string]: Math.max(0, len - 1.5).toFixed(2), ["--off" as string]: (-off).toFixed(2), ["--i" as string]: i }}><title>{`${c} · ${s(amt)}`}</title></circle>; off += len; return el; })}</svg>
              <div className="cu-dn-c"><b>{compact(dnTot).replace("+", "Rs ")}</b><small>{dnRows.length} entries</small></div></div>
            <ul className="cu-dn-list">{dnList.length ? dnList.slice(0, 5).map(([c, amt], i) => <li key={c} style={{ ["--cc" as string]: catColor.get(c), ["--i" as string]: i }}><i /><span>{c}</span><b>{s(amt)}</b><em>{dnTot ? Math.round((amt / dnTot) * 100) : 0}%</em></li>) : <li className="none">No entries in range</li>}</ul>
          </div>
        </aside>
      </div>
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <ConfirmDialog open={confirmLock} onClose={() => setConfirmLock(false)} onConfirm={() => { setConfirmLock(false); void dc.lock(); }} title={`Lock ${dMon(day)} with ${v < 0 ? "a short" : "an over"} of ${rs(Math.abs(v))}?`} confirmLabel="Lock day">
        A variance journal for {rs(Math.abs(v))} is posted to Cash over / short and the day becomes read-only.{Math.abs(v) > tol ? ` It is beyond the ±${rs(tol)} tolerance, so it needs cash approval.` : ""}
      </ConfirmDialog>
      <Drawer open={!!vid} onClose={() => setVid(null)} title={voucher?.docNo ?? "Voucher"} subtitle={voucher ? `${voucher.voucherType} · ${dateLabel(voucher.docDate)} · ${voucher.status.replace(/_/g, " ").toLowerCase()}` : undefined}
        foot={voucher && <button type="button" className="btn secondary" onClick={() => router.push(`/accounting/vouchers/${voucher.id}`)}><ArrowUpRight />Open in Vouchers</button>}>
        {vErr ? <p className="cu-muted">{vErr}</p> : !voucher ? <p className="cu-muted">Loading…</p> : (
          <div className="cu-vd">
            <p style={{ margin: "0 0 12px" }}>{voucher.narration}</p>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: "0 0 14px", fontSize: 13 }}>
              <dt className="cu-muted">Branch</dt><dd style={{ margin: 0 }}>{voucher.branch.name}</dd>
              {voucher.partyName && <><dt className="cu-muted">Party</dt><dd style={{ margin: 0 }}>{voucher.partyName}</dd></>}
              {voucher.referenceNo && <><dt className="cu-muted">Reference</dt><dd style={{ margin: 0 }}>{voucher.referenceNo}</dd></>}
              <dt className="cu-muted">Prepared by</dt><dd style={{ margin: 0 }}>{voucher.preparedBy?.name ?? "—"}</dd>
              {voucher.postedBy && <><dt className="cu-muted">Posted by</dt><dd style={{ margin: 0 }}>{voucher.postedBy.name}</dd></>}
            </dl>
            <div className="al-table"><table>
              <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
              <tbody>{voucher.lines.map((l) => <tr key={l.id}><td><b>{l.account.code} · {l.account.name}</b>{l.particulars && <small style={{ display: "block" }} className="cu-muted">{l.particulars}</small>}</td><td className="num">{l.debit ? <Money value={l.debit} /> : "—"}</td><td className="num">{l.credit ? <Money value={l.credit} /> : "—"}</td></tr>)}</tbody>
              <tfoot><tr><td><b>Total</b></td><td className="num"><b><Money value={voucher.totalDebit} /></b></td><td className="num"><b><Money value={voucher.totalCredit} /></b></td></tr></tfoot>
            </table></div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Kpi({ tone, icon, label, value, sub }: { tone: string; icon: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return <div className={cn("cu-kpi", tone)}><span className="cu-kpi-ic">{icon}</span><div><small>{label}</small><b>{value}</b><em>{sub}</em></div></div>;
}

function Den({ tone, label, value, amt, coin, disabled, onChange }: { tone: string; label: string; value: number; amt: number; coin?: boolean; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <div className={cn("cu-den", coin && "coins")}>
      <span className={cn("cu-note", tone)}>{coin && <Coins />}{label}</span>
      <span className="cu-x">{coin ? "" : "×"}</span>
      <div className="cu-step">
        <button type="button" disabled={disabled} aria-label={`Fewer ${label}`} onClick={() => onChange(value - 1)}><Minus /></button>
        <input type="number" min="0" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label={coin ? "Coins amount" : `${label} notes`} />
        <button type="button" disabled={disabled} aria-label={`More ${label}`} onClick={() => onChange(value + 1)}><Plus /></button>
      </div>
      <b>{rs(amt)}</b>
    </div>
  );
}

function LockSvg() {
  return <svg className="cu-lock-svg" viewBox="0 0 24 24" aria-hidden="true"><path className="sh" d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" /><rect x="5" y="11" width="14" height="10" rx="2.5" /><circle cx="12" cy="16" r="1.3" /></svg>;
}
