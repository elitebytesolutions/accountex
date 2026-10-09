"use client";

import { BookX, CircleCheck, FileQuestion, FileText, Lightbulb, Link2, Lock, LockOpen, Play, Upload, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BankingOptions, ReconDetail, Reconciliation } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { dateLabel, Money } from "@/features/finance/components/finance-ui";
import {
  bankingOptions, createReconciliation, getReconciliation, listReconciliations, reconAdjust, reconAutoMatch, reconComplete, reconMatch, reconReopen,
  reconUnmatch, updateReconciliation,
} from "../api";

type Can = { create: boolean; edit: boolean; complete: boolean; reopen: boolean };
type BankAccount = BankingOptions["bankAccounts"][number];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const short = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const monthOf = (iso: string) => `${LONG[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const amt = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const paren = (n: number) => (n ? `(${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "0.00");
const plain = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bankLabel = (b: BankAccount) => `${b.bankName || b.title}${b.last4 ? ` — ${b.last4}` : ""}`;
const apiMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const today = () => new Date().toISOString().slice(0, 10);
const isOpen = (r: { status: string }) => r.status === "IN_PROGRESS" || r.status === "REOPENED";

const STMT_BADGE: Record<string, [string, string]> = { MATCHED: ["good", "Matched"], SUGGESTED: ["info", "Suggested"], UNMATCHED: ["warn", "Unmatched"] };
const BOOK_BADGE: Record<string, [string, string]> = { MATCHED: ["good", "Matched"], UNPRESENTED: ["warn", "Unpresented"], UNMATCHED: ["warn", "Unmatched"], SUGGESTED: ["info", "Suggested"] };
const STATUS_BADGE: Record<string, [string, string]> = { CLOSED: ["good", "Closed"], IN_PROGRESS: ["info", "In progress"], REOPENED: ["warn", "Reopened"] };

/** Finance › Bank › Bank Reconciliation (template app/bank/reconciliation): match statement lines with book entries, then lock the month. */
export function ReconciliationScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [opts, setOpts] = useState<BankingOptions | null>(null);
  const [account, setAccount] = useState("");
  const [history, setHistory] = useState<Reconciliation[] | null>(null);
  const [detail, setDetail] = useState<ReconDetail | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [stmtSel, setStmtSel] = useState<string[]>([]);
  const [bookSel, setBookSel] = useState<string | null>(null);
  const [balance, setBalance] = useState("");
  const [start, setStart] = useState({ periodTo: today(), statementBalance: "" });
  const [startErr, setStartErr] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"finish" | "reopen" | null>(null);

  // bank accounts
  useEffect(() => {
    let live = true;
    bankingOptions()
      .then((o) => {
        if (!live) return;
        setOpts(o);
        setAccount((a) => a || (o.bankAccounts.find((b) => b.status === "ACTIVE") ?? o.bankAccounts[0])?.id || "");
      })
      .catch((e) => live && setError({ message: apiMessage(e, "Could not load bank accounts"), reference: e instanceof ApiError ? e.correlationId : undefined }));
    return () => { live = false; };
  }, [attempt]);

  const show = useCallback((d: ReconDetail | null) => {
    setDetail(d);
    setStmtSel([]);
    setBookSel(null);
    setBalance(d ? String(d.statementBalance) : "");
  }, []);

  // the account's reconciliations: the open one is shown, otherwise the start card
  const loadAccount = useCallback(async (id: string) => {
    const list = await listReconciliations(id);
    setHistory(list);
    const open = list.find(isOpen);
    show(open ? await getReconciliation(open.id) : null);
  }, [show]);

  useEffect(() => {
    if (!account) return;
    let live = true;
    listReconciliations(account)
      .then(async (list) => {
        const open = list.find(isOpen);
        const d = open ? await getReconciliation(open.id) : null;
        if (!live) return;
        setHistory(list);
        show(d);
      })
      .catch((e) => live && setError({ message: apiMessage(e, "Could not load the reconciliation"), reference: e instanceof ApiError ? e.correlationId : undefined }));
    return () => { live = false; };
  }, [account, show, attempt]);

  const bank = opts?.bankAccounts.find((b) => b.id === account) ?? null;
  const closed = detail?.status === "CLOSED";
  const editable = !!detail && !closed && can.edit;

  /** Runs an action that returns the fresh reconciliation; reloads when someone else changed it. */
  const run = async (key: string, work: () => Promise<ReconDetail | null>, done?: (d: ReconDetail | null) => string | null) => {
    setBusy(key);
    try {
      const d = await work();
      show(d);
      if (d && account) setHistory(await listReconciliations(account));
      const msg = done?.(d);
      if (msg) toast(msg, { tone: "good" });
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONCURRENCY_CONFLICT" && account) {
        toast("Someone else changed this reconciliation; it was reloaded.", { tone: "warn" });
        await loadAccount(account).catch(() => undefined);
      } else if (e instanceof ApiError && e.code === "RECON_NOT_BALANCED") {
        toast(`${e.message} Match the open items, book adjustments or check the statement balance.`, { tone: "warn", ms: 7000 });
      } else toast(apiMessage(e, "Something went wrong"), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const k = useMemo(() => {
    if (!detail) return null;
    const matched = detail.statement.filter((s) => s.status === "MATCHED").length;
    const openStmt = detail.statement.filter((s) => s.status !== "MATCHED");
    const openBook = detail.book.filter((b) => b.status !== "MATCHED");
    return {
      total: detail.statement.length, matched, pct: detail.statement.length ? Math.round((matched / detail.statement.length) * 100) : 0,
      openStmt: openStmt.length, openStmtNet: openStmt.reduce((s, x) => s + x.amount, 0),
      openBook: openBook.length, openBookNet: openBook.reduce((s, x) => s + x.amount, 0),
      suggestions: detail.statement.filter((s) => s.status === "SUGGESTED").length,
      adjustable: openStmt.filter((s) => s.status !== "MATCHED").length,
    };
  }, [detail]);

  const suggestedFor = useMemo(() => new Set(detail?.statement.filter((s) => s.status === "SUGGESTED" && s.suggestedTxnId).map((s) => s.suggestedTxnId!) ?? []), [detail]);
  const hoverPartner = stmtSel.length === 1 ? detail?.statement.find((s) => s.id === stmtSel[0])?.suggestedTxnId ?? null : null;

  const match = (statementLineId: string, bankTransactionId: string) =>
    run("match", () => reconMatch(detail!.id, { statementLineId, bankTransactionId, rowVersion: detail!.rowVersion }), () => "Matched");
  const unmatch = (matchId: string) => run("unmatch", () => reconUnmatch(detail!.id, { matchId, rowVersion: detail!.rowVersion }), () => "Unmatched");

  const toggleStmt = (id: string, status: string, matchId: string | null) => {
    if (!editable) return;
    if (status === "MATCHED" && matchId) return unmatch(matchId);
    setStmtSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const toggleBook = (id: string, status: string, matchId: string | null) => {
    if (!editable) return;
    if (status === "MATCHED" && matchId) return unmatch(matchId);
    setBookSel((b) => (b === id ? null : id));
  };

  const saveBalance = () => {
    if (!detail || !editable) return;
    const n = Number(balance.replace(/,/g, ""));
    if (!Number.isFinite(n)) { toast("Enter the statement balance as a number", { tone: "warn" }); return; }
    if (Math.round(n * 100) === Math.round(detail.statementBalance * 100)) return;
    run("balance", () => updateReconciliation(detail.id, { statementBalance: n, remarks: detail.remarks, rowVersion: detail.rowVersion }), () => "Statement balance saved");
  };

  const startMonth = () => {
    const e: Record<string, string> = {};
    const n = Number(start.statementBalance.replace(/,/g, ""));
    if (!start.periodTo) e.periodTo = "Choose the statement date";
    if (start.statementBalance.trim() === "" || !Number.isFinite(n)) e.statementBalance = "Enter the closing balance on the statement";
    setStartErr(e);
    if (Object.keys(e).length) return;
    run("start", () => createReconciliation({ bankAccountId: account, periodTo: start.periodTo, statementBalance: n }), (d) => (d ? `${d.docNo} started — ${d.statement.filter((s) => s.status === "MATCHED").length} lines matched` : null))
      .catch(() => undefined);
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => { setError(null); setAttempt((a) => a + 1); }} />;

  const latestClosed = history?.find((h) => h.status === "CLOSED") ?? null;
  const description = bank
    ? <>Match statement lines with book entries for {bankLabel(bank)}{detail ? <> · {monthOf(detail.periodTo)}</> : null}.</>
    : "Match statement lines with book entries.";

  return (
    <>
      <PageHead
        eyebrow="Bank / Reconciliation"
        title="Bank Reconciliation"
        description={description}
        actions={
          <>
            <select value={account} onChange={(e) => { setHistory(null); show(null); setAccount(e.target.value); }} aria-label="Bank account" disabled={!opts}>
              {opts?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{bankLabel(b)}</option>)}
            </select>
            <Link className="btn secondary" href="/bank/transactions"><Upload />Import</Link>
            <button className="btn secondary" type="button" disabled={!editable || !!busy}
              onClick={() => run("auto", async () => { const r = await reconAutoMatch(detail!.id, detail!.rowVersion); toast(r.matched ? `${r.matched} additional match${r.matched === 1 ? "" : "es"} found` : "No new matches found", { tone: r.matched ? "good" : "info" }); return r.reconciliation; })}>
              <WandSparkles />Auto-match
            </button>
            <button className="btn primary" type="button" disabled={!detail || closed || !can.complete || !!busy} onClick={() => setConfirm("finish")}>
              <Lock />Finish
            </button>
          </>
        }
      />

      {opts && !opts.bankAccounts.length ? (
        <EmptyState icon={<FileText />} title="No bank accounts yet" description="Add a bank account first, then import its statement to reconcile it."
          action={<Link className="btn primary" href="/bank/accounts">Bank accounts</Link>} />
      ) : (
        <>
          <div className="kpi-grid mb">
            <div className="kpi"><div className="kpi-top"><span>Statement lines</span><span className="icon-well"><FileText /></span></div><strong>{k ? k.total.toLocaleString("en-US") : "—"}</strong><small>{k ? `${k.matched} matched` : "No reconciliation open"}</small></div>
            <div className="kpi teal"><div className="kpi-top"><span>Matched</span><span className="icon-well"><CircleCheck /></span></div><strong>{k ? `${k.pct}%` : "—"}</strong><div className="progress" style={{ marginTop: 6 }}><i style={{ width: `${k?.pct ?? 0}%` }} /></div></div>
            <div className="kpi yellow"><div className="kpi-top"><span>Unmatched statement</span><span className="icon-well"><FileQuestion /></span></div><strong>{k ? k.openStmt : "—"}</strong><small>{k ? <><Money value={k.openStmtNet} dec={0} /> net</> : " "}</small></div>
            <div className="kpi red"><div className="kpi-top"><span>Unmatched book</span><span className="icon-well"><BookX /></span></div><strong>{k ? k.openBook : "—"}</strong><small>{k ? <><Money value={k.openBookNet} dec={0} /> net</> : " "}</small></div>
          </div>

          <div className="split">
            <div className="stack">
              {history === null ? (
                <div className="panel"><Skeleton style={{ height: 260 }} /></div>
              ) : !detail ? (
                <StartCard can={can} bank={bank} latestClosed={latestClosed} value={start} errors={startErr} busy={busy === "start"}
                  onChange={(v) => setStart((s) => ({ ...s, ...v }))} onStart={startMonth} />
              ) : (
                <>
                  <div className="grid-2">
                    <div className="panel flush">
                      <div className="panel-head">
                        <div><h3>Bank statement</h3><p>{bank?.bankName || bank?.title} · {dateLabel(detail.periodFrom)} – {dateLabel(detail.periodTo)}</p></div>
                        {editable && (stmtSel.length > 0 || bookSel) && (
                          <div className="panel-actions">
                            <button className="btn sm ghost" type="button" onClick={() => { setStmtSel([]); setBookSel(null); }}><X />Clear</button>
                            <button className="btn sm primary" type="button" disabled={stmtSel.length !== 1 || !bookSel || !!busy} onClick={() => match(stmtSel[0]!, bookSel!)}><Link2 />Match</button>
                          </div>
                        )}
                      </div>
                      <div className="table-wrap"><table className="tbl">
                        <thead><tr><th /><th>Date</th><th>Description</th><th className="num">Amount</th><th /></tr></thead>
                        <tbody>
                          {!detail.statement.length && <tr><td colSpan={5}><EmptyState icon={<Upload />} title="No statement lines" description="Import the bank statement for this period." /></td></tr>}
                          {detail.statement.map((s) => {
                            const [tone, label] = STMT_BADGE[s.status] ?? ["neutral", s.status];
                            const sel = stmtSel.includes(s.id);
                            return (
                              <tr key={s.id} className={cn(sel && "selected")} onClick={() => toggleStmt(s.id, s.status, s.matchId)} style={{ cursor: editable ? "pointer" : undefined }}>
                                <td><input type="checkbox" checked={s.status === "MATCHED" || sel} disabled={!editable} onChange={() => undefined} aria-label={s.status === "MATCHED" ? "Unmatch" : "Select"} /></td>
                                <td>{short(s.txnDate)}</td>
                                <td>{s.description}{s.reference && <small>{s.reference}</small>}</td>
                                <td className={cn("num", s.amount < 0 ? "cr" : "dr")}>{amt(s.amount)}</td>
                                <td>
                                  <span className={`badge ${tone}`}>{label}</span>
                                  {s.status === "SUGGESTED" && s.suggestedTxnId && editable && (
                                    <button type="button" className="btn ghost sm" title="Match with the suggested book entry" onClick={(e) => { e.stopPropagation(); match(s.id, s.suggestedTxnId!); }}><Link2 /></button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table></div>
                    </div>
                    <div className="panel flush">
                      <div className="panel-head">
                        <div><h3>Book entries</h3><p>GL {detail.bankAccount.glCode ?? "—"} · posted vouchers</p></div>
                      </div>
                      <div className="table-wrap"><table className="tbl">
                        <thead><tr><th /><th>Date</th><th>Voucher</th><th className="num">Amount</th><th /></tr></thead>
                        <tbody>
                          {!detail.book.length && <tr><td colSpan={5}><EmptyState icon={<BookX />} title="No book entries" description="Posted vouchers on this bank account appear here." /></td></tr>}
                          {detail.book.map((b) => {
                            const status = b.status !== "MATCHED" && suggestedFor.has(b.id) ? "SUGGESTED" : b.status;
                            const [tone, label] = BOOK_BADGE[status] ?? ["neutral", status];
                            const sel = bookSel === b.id;
                            return (
                              <tr key={b.id} className={cn((sel || hoverPartner === b.id) && "selected")} onClick={() => toggleBook(b.id, b.status, b.matchId)} style={{ cursor: editable ? "pointer" : undefined }}>
                                <td><input type="checkbox" checked={b.status === "MATCHED" || sel} disabled={!editable} onChange={() => undefined} aria-label={b.status === "MATCHED" ? "Unmatch" : "Select"} /></td>
                                <td>{short(b.txnDate)}</td>
                                <td>
                                  {b.voucher ? <Link className="link" href={`/accounting/vouchers/${b.voucher.id}`} onClick={(e) => e.stopPropagation()}>{b.voucher.docNo}</Link> : "—"}
                                  <small>{b.reference ? `${b.reference} · ` : ""}{b.description}</small>
                                </td>
                                <td className={cn("num", b.amount < 0 ? "cr" : "dr")}>{amt(b.amount)}</td>
                                <td><span className={`badge ${tone}`}>{label}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table></div>
                    </div>
                  </div>

                  {editable && (stmtSel.length > 0 || bookSel) ? (
                    <div className="banner info">
                      <Link2 />
                      <div>
                        <b>{stmtSel.length} statement line{stmtSel.length === 1 ? "" : "s"} · {bookSel ? "1 book entry" : "no book entry"} selected</b>
                        <p>Match one statement line with one book entry of the same amount, or book unmatched lines as adjustments.</p>
                      </div>
                      <button className="btn sm ghost" type="button" onClick={() => { setStmtSel([]); setBookSel(null); }}><X />Clear</button>
                      <button className="btn sm secondary" type="button" disabled={stmtSel.length !== 1 || !bookSel || !!busy} onClick={() => match(stmtSel[0]!, bookSel!)}><Link2 />Match</button>
                    </div>
                  ) : (
                    !closed && k && (k.suggestions > 0 || k.adjustable > 0) && (
                      <div className="banner info">
                        <Lightbulb />
                        <div>
                          <b>{k.suggestions ? `${k.suggestions} suggestion${k.suggestions === 1 ? "" : "s"} ready` : `${k.adjustable} unmatched statement line${k.adjustable === 1 ? "" : "s"}`}</b>
                          <p>Bank charges and PLS profit can be booked directly from unmatched statement lines.</p>
                        </div>
                      </div>
                    )
                  )}
                  {editable && stmtSel.length > 0 && (
                    <div className="banner warn">
                      <Lightbulb />
                      <div>
                        <b>Book {stmtSel.length} line{stmtSel.length === 1 ? "" : "s"} as adjustments</b>
                        <p>Money out is booked to bank charges and money in to profit on deposit (a bank payment or receipt voucher each).</p>
                      </div>
                      <button className="btn sm secondary" type="button" disabled={!!busy}
                        onClick={() => run("adjust", async () => { const r = await reconAdjust(detail.id, { statementLineIds: stmtSel, accountId: null, rowVersion: detail.rowVersion }); return r.reconciliation; }, () => "Adjustment vouchers created")}>
                        Create adjustments
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="stack">
              <div className="panel">
                <div className="panel-head">
                  <div><h3>Reconciliation summary</h3><p>{detail ? <>As at {dateLabel(detail.periodTo)} · {detail.docNo}</> : "Start a reconciliation to see the summary"}</p></div>
                  {detail && <span className={`badge ${STATUS_BADGE[detail.status]?.[0] ?? "neutral"}`}>{STATUS_BADGE[detail.status]?.[1] ?? detail.status}</span>}
                </div>
                {detail ? (
                  <>
                    <div className="dl">
                      <div>
                        <span>Balance per bank statement</span>
                        {editable ? (
                          <input className="num" style={{ maxWidth: 150, textAlign: "right" }} value={balance} inputMode="decimal" aria-label="Balance per bank statement"
                            onChange={(e) => setBalance(e.target.value)} onBlur={saveBalance} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
                        ) : <b><Money value={detail.statementBalance} /></b>}
                      </div>
                      <div><span>Less: unpresented cheques</span><b className="cr">{paren(detail.unpresentedCheques)}</b></div>
                      <div><span>Add: deposits in transit</span><b className="dr">{plain(detail.depositsInTransit)}</b></div>
                      <div><span>Adjusted bank balance</span><b><Money value={detail.adjustedBankBalance} /></b></div>
                    </div>
                    <div className="dl mt">
                      <div><span>Balance per books ({detail.bankAccount.glCode ?? "GL"})</span><b><Money value={detail.bookBalance} /></b></div>
                      <div><span>Add: credits not booked</span><b className="dr">{plain(detail.unbookedCredits)}</b></div>
                      <div><span>Less: charges not booked</span><b className="cr">{paren(detail.unbookedDebits)}</b></div>
                      <div><span>Adjusted book balance</span><b><Money value={detail.adjustedBookBalance} /></b></div>
                    </div>
                    {Math.round(detail.difference * 100) === 0 ? (
                      <div className="banner good mt"><CircleCheck /><div><b>Difference Rs 0.00</b><p>{closed ? `Closed by ${detail.closedBy?.name ?? "—"} on ${dateLabel(detail.closedAt)}.` : "Ready to finish and lock this month."}</p></div></div>
                    ) : (
                      <div className="banner warn mt"><Lightbulb /><div><b>Difference <Money value={detail.difference} /></b><p>Match the open items, book adjustments or check the statement balance.</p></div></div>
                    )}
                  </>
                ) : (
                  <Skeleton style={{ height: history === null ? 180 : 0 }} />
                )}
              </div>

              <div className="panel">
                <div className="panel-head"><div><h3>History</h3></div></div>
                {history === null ? <Skeleton style={{ height: 120 }} /> : !history.length ? (
                  <p className="muted" style={{ margin: 0 }}>No reconciliations for this account yet.</p>
                ) : (
                  <div className="list">
                    {history.map((h) => {
                      const [tone, label] = STATUS_BADGE[h.status] ?? ["neutral", h.status];
                      const canReopen = h.id === latestClosed?.id && can.reopen && !history.some(isOpen);
                      return (
                        <div key={h.id} className={cn("list-item", detail?.id === h.id && "active")} role="button" tabIndex={0} style={{ cursor: "pointer" }}
                          onClick={() => run("view", () => getReconciliation(h.id))} onKeyDown={(e) => e.key === "Enter" && run("view", () => getReconciliation(h.id))}>
                          <span className="icon-well">{h.status === "CLOSED" ? <Lock /> : <LockOpen />}</span>
                          <div>
                            <b>{monthOf(h.periodTo)}</b>
                            <small>{h.status === "CLOSED" ? `${h.closedBy?.name ?? "—"} · ${h.closedAt ? short(h.closedAt.slice(0, 10)) : ""}` : `${h.docNo} · ${h.createdBy?.name ?? ""}`}</small>
                          </div>
                          <span className="spacer" />
                          {canReopen && (
                            <button className="btn ghost sm" type="button" onClick={(e) => { e.stopPropagation(); run("view", () => getReconciliation(h.id)).then(() => setConfirm("reopen")); }}>Reopen</button>
                          )}
                          <span className={`badge ${tone}`}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm === "finish"}
        onClose={() => setConfirm(null)}
        title={`Finish ${detail ? monthOf(detail.periodTo) : ""}?`}
        confirmLabel="Finish and lock"
        busy={busy === "finish"}
        onConfirm={() => run("finish", () => reconComplete(detail!.id, detail!.rowVersion), (d) => (d ? `Reconciliation saved — ${monthOf(d.periodTo)}` : null)).then(() => setConfirm(null))}
      >
        Matched entries are marked reconciled and the bank account is reconciled to {detail ? dateLabel(detail.periodTo) : ""}. It can only be finished at a zero difference; the latest month can be reopened later.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "reopen"}
        onClose={() => setConfirm(null)}
        title={`Reopen ${detail ? monthOf(detail.periodTo) : ""}?`}
        confirmLabel="Reopen"
        danger
        busy={busy === "reopen"}
        onConfirm={() => run("reopen", () => reconReopen(detail!.id, detail!.rowVersion), () => "Reconciliation reopened").then(() => setConfirm(null))}
      >
        Its entries are no longer marked reconciled and the bank account steps back to the previous closed month until you finish it again.
      </ConfirmDialog>
    </>
  );
}

function StartCard({ can, bank, latestClosed, value, errors, busy, onChange, onStart }: {
  can: Can; bank: BankAccount | null; latestClosed: Reconciliation | null; value: { periodTo: string; statementBalance: string };
  errors: Record<string, string>; busy: boolean; onChange: (v: Partial<{ periodTo: string; statementBalance: string }>) => void; onStart: () => void;
}) {
  const from = bank?.reconciledTo ? `after ${dateLabel(bank.reconciledTo)}` : "from the first entry";
  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Start a reconciliation</h3>
          <p>{latestClosed ? <>Last closed: {monthOf(latestClosed.periodTo)}. </> : null}The new period runs {from} up to the statement date.</p>
        </div>
      </div>
      {can.create ? (
        <>
          <FormGrid>
            <Field label="Statement date (period end)" required error={errors.periodTo}>
              <input type="date" value={value.periodTo} onChange={(e) => onChange({ periodTo: e.target.value })} />
            </Field>
            <Field label="Closing balance on the statement" required error={errors.statementBalance} hint="From the last line of the bank statement">
              <input inputMode="decimal" placeholder="0.00" value={value.statementBalance} onChange={(e) => onChange({ statementBalance: e.target.value })} />
            </Field>
          </FormGrid>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn primary" type="button" disabled={busy} onClick={onStart}><Play />Start reconciliation</button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>No reconciliation is in progress for this account.</p>
      )}
    </div>
  );
}
