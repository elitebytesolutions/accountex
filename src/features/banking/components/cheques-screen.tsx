"use client";

import { CircleX, Hourglass, MoreHorizontal, Scroll, Search, Send, Wallet } from "lucide-react";
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
import { amt, bankLabel, ChequeDialogs, chequeMenu, ChequeForm, ChequeStatus, type ChequeDialog } from "./cheque-ui";

type Can = { create: boolean; edit: boolean; post: boolean };
type Dir = "RECEIVED" | "ISSUED";
const PAGE = 20;
const CHIPS: Record<Dir, { label: string; status: string }[]> = {
  RECEIVED: [{ label: "All", status: "" }, { label: "In hand", status: "IN_HAND" }, { label: "Deposited", status: "DEPOSITED" }, { label: "Cleared", status: "CLEARED" }, { label: "Bounced", status: "BOUNCED" }],
  ISSUED: [{ label: "All", status: "" }, { label: "Issued", status: "ISSUED" }, { label: "Presented", status: "PRESENTED" }, { label: "Cleared", status: "CLEARED" }, { label: "Stopped", status: "STOPPED" }],
};

/** Template app/bank/cheques (40-acc-core.html): KPIs, received / issued tabs, and the Record cheque panel. */
export function ChequesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [options, setOptions] = useState<BankingOptions | null>(null);
  const [tab, setTab] = useState<Dir>("RECEIVED");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ChequeList | null>(null);
  const [counts, setCounts] = useState<Record<Dir, number>>({ RECEIVED: 0, ISSUED: 0 });
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
    Promise.all([
      listCheques({ direction: tab, status, search, page, pageSize: PAGE }),
      listCheques({ direction: "RECEIVED", pageSize: 1 }),
      listCheques({ direction: "ISSUED", pageSize: 1 }),
    ])
      .then((r) => {
        if (cancelled) return;
        setData(r[0]);
        setCounts({ RECEIVED: r[1].total, ISSUED: r[2].total });
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load cheques" }));
    return () => {
      cancelled = true;
    };
  }, [tab, status, search, page, attempt]);
  const load = () => setAttempt((n) => n + 1);

  const k = data?.kpis;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const switchTab = (t: Dir) => { setTab(t); setStatus(""); setPage(1); setData(null); };
  const done = (msg: string) => { setDialog(null); toast(msg, { tone: "good" }); load(); };
  const rowMenu = (c: Cheque) => chequeMenu(c, can, {
    act: (a) => setDialog({ kind: "act", cheque: c, action: a }), bounce: () => setDialog({ kind: "bounce", cheque: c }),
    replace: () => setDialog({ kind: "replace", cheque: c }), edit: () => setDialog({ kind: "edit", cheque: c }), open: () => setDialog({ kind: "open", cheque: c }),
  });

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((a) => a + 1)} />;
  return (
    <>
      <PageHead
        eyebrow="Bank / Cheques"
        title="Receive & Issue Cheques"
        description="Record cheques received from customers and issued to vendors, including post-dated cheques."
        actions={<ButtonLink icon={<Scroll />} href="/bank/cheque-register">Cheque register</ButtonLink>}
      />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>In hand</span><span className="icon-well"><Wallet /></span></div><strong>{k ? <Money value={k.inHand} dec={0} /> : "—"}</strong><small>{k ? `${k.inHandCount} cheque${k.inHandCount === 1 ? "" : "s"}` : " "}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Deposited · in clearing</span><span className="icon-well"><Hourglass /></span></div><strong>{k ? <Money value={k.deposited} dec={0} /> : "—"}</strong><small>{k ? `${k.depositedCount} cheque${k.depositedCount === 1 ? "" : "s"}` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Issued · unpresented</span><span className="icon-well"><Send /></span></div><strong>{k ? <Money value={k.issuedUnpresented} dec={0} /> : "—"}</strong><small>{k ? `${k.issuedCount} cheque${k.issuedCount === 1 ? "" : "s"}` : " "}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Bounced (FY)</span><span className="icon-well"><CircleX /></span></div><strong>{k?.bouncedCount ?? "—"}</strong><small className={cn(k && k.bounced > 0 && "down")}>{k ? <Money value={k.bounced} dec={0} /> : " "}</small></div>
      </div>

      <div className="split">
        <div className="panel">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "RECEIVED"} className={cn(tab === "RECEIVED" && "active")} onClick={() => switchTab("RECEIVED")}>Received <span className="badge neutral">{counts.RECEIVED}</span></button>
            <button type="button" role="tab" aria-selected={tab === "ISSUED"} className={cn(tab === "ISSUED" && "active")} onClick={() => switchTab("ISSUED")}>Issued <span className="badge neutral">{counts.ISSUED}</span></button>
          </div>
          <div className="toolbar">
            <label className="search-field"><Search /><input placeholder={tab === "RECEIVED" ? "Cheque no., customer…" : "Cheque no., payee…"} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
            <div className="chips">
              {CHIPS[tab].map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); }}>{c.label}</button>)}
            </div>
          </div>
          {!data ? (
            <Skeleton style={{ height: 320 }} />
          ) : !items.length ? (
            <EmptyState icon={<Wallet />} title={status || search ? "No cheques match" : tab === "RECEIVED" ? "No cheques received yet" : "No cheques issued yet"} description={status || search ? "Try another status or search." : "Record one with the form on the right."} />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Cheque #</th><th>{tab === "RECEIVED" ? "Customer" : "Payee"}</th><th>{tab === "RECEIVED" ? "Drawn on" : "Bank"}</th><th>Cheque date</th><th className="num">Amount</th><th>Status</th><th /></tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setDialog({ kind: "open", cheque: c }); }}>
                      <td><b><Hl text={c.chequeNo} q={search} /></b>{c.isPdc && <small>PDC</small>}</td>
                      <td><Hl text={c.partyName} q={search} /></td>
                      <td>{tab === "RECEIVED" ? (c.drawnOnBank?.name ?? "—") : bankLabel(c.bankAccount)}</td>
                      <td>{dateLabel(c.chequeDate)}</td>
                      <td className="num">{amt(c.amount)}</td>
                      <td><ChequeStatus status={c.status} /></td>
                      <td className="actions">
                        {c.direction === "RECEIVED" && c.status === "IN_HAND" && can.post ? (
                          <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "act", cheque: c, action: "deposit" })}>Deposit</Button>
                        ) : c.status === "DEPOSITED" && c.direction === "RECEIVED" && !can.post ? (
                          <span className="po-chq-note">In clearing</span>
                        ) : (
                          <button type="button" className="icon-btn-sm" aria-label={`Actions for cheque ${c.chequeNo}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: rowMenu(c) })}><MoreHorizontal /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && total > PAGE && (
            <div className="table-foot">
              <span>Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}</span>
              <div className="pager">
                <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
                <button type="button" className="active">{page}</button>
                <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>›</button>
              </div>
            </div>
          )}
        </div>

        {can.create ? (
          <div className="panel">
            <RecordPanel options={options} onSaved={(c) => { toast(`Cheque ${c.chequeNo} recorded · ${c.voucher?.docNo ?? "entry"} posted`, { tone: "good" }); if (c.direction !== tab) switchTab(c.direction as Dir); else load(); }} />
          </div>
        ) : (
          <div className="panel"><EmptyState icon={<Wallet />} title="View only" description="You can see cheques but not record them." /></div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
      <ChequeDialogs dialog={dialog} options={options} onClose={() => setDialog(null)} onDone={(msg) => done(msg)} />
    </>
  );
}

function RecordPanel({ options, onSaved }: { options: BankingOptions | null; onSaved: (c: Cheque) => void }) {
  const [issue, setIssue] = useState(false);
  return (
    <>
      <div className="panel-head"><div><h3>Record cheque</h3><p>{issue ? "Issue a cheque to a vendor" : "Receive from customer"}</p></div>{!options && <Badge tone="neutral">Loading…</Badge>}</div>
      <div onClickCapture={(e) => { const b = (e.target as HTMLElement).closest(".seg button"); if (b) setIssue(b.textContent?.trim() === "Issue"); }}>
        <ChequeForm options={options} onSaved={onSaved} />
      </div>
    </>
  );
}
