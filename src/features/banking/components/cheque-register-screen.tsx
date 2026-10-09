"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarCheck, CircleX, Hourglass, MoreHorizontal, Plus, Printer, Scroll, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { BankingOptions, Cheque, ChequeList } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Hl, Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { bankingOptions, listCheques } from "../api";
import { amt, bankLabel, ChequeDialogs, chequeMenu, ChequeStatus, daysTo, todayIso, type ChequeAct, type ChequeDialog } from "./cheque-ui";

type Can = { create: boolean; post: boolean };
type Chip = "ALL" | "RECEIVED" | "ISSUED" | "PDC" | "BOUNCED";
const PAGE = 12;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const signed = (n: number) => `${n < 0 ? "−" : "+"}${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

/** The template's per-status buttons in the register (In hand → Deposit, Deposited → Clear + Bounce, …). */
const QUICK: Record<string, { action: ChequeAct | "bounce" | "replace"; label: string; variant: "primary" | "secondary" | "ghost" }[]> = {
  "RECEIVED:IN_HAND": [{ action: "deposit", label: "Deposit", variant: "primary" }],
  "RECEIVED:DEPOSITED": [{ action: "clear", label: "Clear", variant: "secondary" }, { action: "bounce", label: "Bounce", variant: "ghost" }],
  "RECEIVED:CLEARED": [{ action: "cancel", label: "Reverse", variant: "ghost" }],
  "RECEIVED:BOUNCED": [{ action: "re-present", label: "Re-present", variant: "ghost" }, { action: "replace", label: "Replace", variant: "ghost" }],
  "ISSUED:ISSUED": [{ action: "clear", label: "Clear", variant: "secondary" }, { action: "stop", label: "Stop", variant: "ghost" }],
  "ISSUED:PRESENTED": [{ action: "clear", label: "Clear", variant: "secondary" }, { action: "bounce", label: "Bounce", variant: "ghost" }],
  "ISSUED:CLEARED": [{ action: "cancel", label: "Reverse", variant: "ghost" }],
  "ISSUED:BOUNCED": [{ action: "re-present", label: "Re-present", variant: "ghost" }],
  "ISSUED:STOPPED": [{ action: "replace", label: "Replace", variant: "ghost" }],
};

/** Template app/bank/cheque-register (40-acc-core.html): KPIs, 10-day maturity calendar, register table, bounce modal. */
export function ChequeRegisterScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [options, setOptions] = useState<BankingOptions | null>(null);
  const [chip, setChip] = useState<Chip>("ALL");
  const [maturing, setMaturing] = useState<"30" | "overdue" | "all">("all");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ChequeList | null>(null);
  const [counts, setCounts] = useState<Record<Chip, number>>({ ALL: 0, RECEIVED: 0, ISSUED: 0, PDC: 0, BOUNCED: 0 });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [dialog, setDialog] = useState<ChequeDialog>(null);

  useEffect(() => {
    bankingOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    const base = { search, maturing: maturing === "all" ? undefined : maturing };
    const chipQ = (c: Chip) => ({ ...base, ...(c === "RECEIVED" || c === "ISSUED" ? { direction: c } : {}), ...(c === "PDC" ? { pdc: "1" } : {}), ...(c === "BOUNCED" ? { status: "BOUNCED" } : {}) });
    Promise.all([
      listCheques({ ...chipQ(chip), page, pageSize: PAGE }),
      ...(["ALL", "RECEIVED", "ISSUED", "PDC", "BOUNCED"] as Chip[]).map((c) => listCheques({ ...chipQ(c), pageSize: 1 })),
    ])
      .then((r) => {
        if (cancelled) return;
        setData(r[0]!);
        setCounts({ ALL: r[1]!.total, RECEIVED: r[2]!.total, ISSUED: r[3]!.total, PDC: r[4]!.total, BOUNCED: r[5]!.total });
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the cheque register" }));
    return () => {
      cancelled = true;
    };
  }, [chip, maturing, search, page, attempt]);
  const load = () => setAttempt((n) => n + 1);

  const k = data?.kpis;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const today = todayIso();
  const open = (c: Cheque, action: ChequeAct | "bounce" | "replace") =>
    setDialog(action === "bounce" ? { kind: "bounce", cheque: c } : action === "replace" ? { kind: "replace", cheque: c } : { kind: "act", cheque: c, action });
  const rowMenu = (c: Cheque) => chequeMenu(c, { ...can, edit: false }, {
    act: (a) => open(c, a), bounce: () => open(c, "bounce"), replace: () => open(c, "replace"), edit: () => undefined, open: () => setDialog({ kind: "open", cheque: c }),
  });
  const maturingToday = data?.calendar.find((d) => d.date === today);

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((a) => a + 1)} />;
  return (
    <>
      <PageHead
        eyebrow="Bank / Cheque Register"
        title="Cheque Register & PDC"
        description="Lifecycle of every cheque — deposit, clearing, bounce and reversal — with post-dated maturity tracking."
        actions={
          <>
            <Button icon={<Printer />} onClick={() => window.print()}>Print register</Button>
            {can.create && <ButtonLink variant="primary" icon={<Plus />} href="/bank/cheques">Record cheque</ButtonLink>}
          </>
        }
      />

      <div className="kpi-grid c5 mb">
        <div className="kpi"><div className="kpi-top"><span>PDC receivable</span><span className="icon-well"><ArrowDownLeft /></span></div><strong>{k ? <Money value={k.pdcReceivable} dec={0} /> : "—"}</strong><small>Post-dated, in hand</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>PDC payable</span><span className="icon-well"><ArrowUpRight /></span></div><strong>{k ? <Money value={k.pdcPayable} dec={0} /> : "—"}</strong><small>Post-dated, issued</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Maturing today</span><span className="icon-well"><CalendarCheck /></span></div><strong>{k ? <Money value={k.maturingToday} dec={0} /> : "—"}</strong><small>{maturingToday ? `In ${signed(maturingToday.receivable)} · out ${signed(-maturingToday.payable)}` : " "}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>In clearing</span><span className="icon-well"><Hourglass /></span></div><strong>{k ? <Money value={k.deposited} dec={0} /> : "—"}</strong><small>{k ? `${k.depositedCount} deposited · T+1 expected` : " "}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Bounced (FY)</span><span className="icon-well"><CircleX /></span></div><strong>{k ? <Money value={k.bounced} dec={0} /> : "—"}</strong><small className={cn(k && k.bouncedCount > 0 && "down")}>{k ? `${k.bouncedCount} cheque${k.bouncedCount === 1 ? "" : "s"}` : " "}</small></div>
      </div>

      <div className="panel mb">
        <div className="panel-head"><div><h3>Maturity calendar</h3><p>Next 10 days · receivable vs payable</p></div></div>
        <div className="chq-cal" style={{ display: "grid", gridTemplateColumns: "repeat(10,minmax(64px,1fr))", gap: 8, overflowX: "auto", padding: 2, margin: -2 }}>
          {(data?.calendar ?? []).map((d, i) => {
            const dt = new Date(`${d.date}T00:00:00`);
            return (
              <div key={d.date} className="card" style={{ padding: 10, ...(i === 0 && { boxShadow: "0 0 0 2px var(--primary)" }) }}>
                <small className="muted">{DOW[dt.getDay()]}</small>
                <b style={{ display: "block", fontSize: 18 }}>{i === 0 || dt.getDate() === 1 ? `${String(dt.getDate()).padStart(2, "0")} ${MON[dt.getMonth()]}` : String(dt.getDate()).padStart(2, "0")}</b>
                {!d.receivable && !d.payable && <small className="muted">—</small>}
                {d.receivable > 0 && <small className="dr" style={{ display: "block" }}>{signed(d.receivable)}</small>}
                {d.payable > 0 && <small className="cr" style={{ display: "block" }}>{signed(-d.payable)}</small>}
              </div>
            );
          })}
          {!data && Array.from({ length: 10 }, (_, i) => <Skeleton key={i} style={{ height: 76 }} />)}
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Cheques</h3><p>Issued and received, including post-dated</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Cheque no., party, bank…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            {(["ALL", "RECEIVED", "ISSUED", "PDC", "BOUNCED"] as Chip[]).map((c) => (
              <button key={c} type="button" className={cn(chip === c && "active")} onClick={() => { setChip(c); setPage(1); }}>{c === "ALL" ? "All" : c === "PDC" ? "PDC" : c[0] + c.slice(1).toLowerCase()} <i>{counts[c]}</i></button>
            ))}
          </div>
          <span className="spacer" />
          <select value={maturing} onChange={(e) => { setMaturing(e.target.value as typeof maturing); setPage(1); }} aria-label="Maturity">
            <option value="30">Maturity: next 30 days</option><option value="overdue">Overdue</option><option value="all">All dates</option>
          </select>
        </div>
        {!data ? (
          <div style={{ padding: 18 }}><Skeleton style={{ height: 320 }} /></div>
        ) : !items.length ? (
          <EmptyState icon={<Scroll />} title="No cheques match" description={chip === "ALL" && !search && maturing === "all" ? "Cheques you record appear here." : "Try another filter or maturity window."} />
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Cheque #</th><th>Direction</th><th>Party</th><th>Bank</th><th>Cheque date</th><th>Days</th><th className="num">Amount</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {items.map((c) => {
                  const open1 = c.status === "IN_HAND" || c.status === "ISSUED" || c.status === "DEPOSITED" || c.status === "PRESENTED";
                  const d = daysTo(c.chequeDate);
                  const quick = can.post ? (QUICK[`${c.direction}:${c.status}`] ?? []) : [];
                  return (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setDialog({ kind: "open", cheque: c }); }}>
                      <td><b><Hl text={c.chequeNo} q={search} /></b>{c.isPdc && <small>PDC</small>}</td>
                      <td><Badge tone={c.direction === "RECEIVED" ? "good" : "warn"}>{c.direction === "RECEIVED" ? "Received" : "Issued"}</Badge></td>
                      <td><Hl text={c.partyName} q={search} /></td>
                      <td>{c.direction === "RECEIVED" ? `${c.drawnOnBank?.name ?? "—"}${c.bankAccount ? ` → ${bankLabel(c.bankAccount).replace(" — ", " ")}` : ""}` : bankLabel(c.bankAccount).replace(" — ", " ")}</td>
                      <td>{dateLabel(c.chequeDate)}</td>
                      <td>{!open1 ? "—" : d === 0 ? <Badge tone="warn">Today</Badge> : d < 0 ? `−${-d}` : d}</td>
                      <td className="num">{amt(c.amount)}</td>
                      <td><ChequeStatus status={c.status} /></td>
                      <td className="actions" style={{ whiteSpace: "nowrap" }}>
                        {quick.map((b) => <Button key={b.label} size="sm" variant={b.variant} style={{ marginRight: 4 }} onClick={() => open(c, b.action)}>{b.label}</Button>)}
                        <button type="button" className="icon-btn-sm" aria-label={`More for cheque ${c.chequeNo}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(c) })}><MoreHorizontal /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && total > 0 && (
          <div className="table-foot">
            <span>Showing {Math.min(page * PAGE, total) - (page - 1) * PAGE} of {total} cheque{total === 1 ? "" : "s"}</span>
            <div className="pager">
              <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
              {Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1).map((p) => (
                <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <ChequeDialogs dialog={dialog} options={options} onClose={() => setDialog(null)} onDone={(msg) => { setDialog(null); toast(msg, { tone: "good" }); load(); }} />
    </>
  );
}
