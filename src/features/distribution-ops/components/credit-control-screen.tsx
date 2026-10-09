"use client";

import { Gauge, History, Lock, LockOpen, Plus, Search, ShieldCheck, TrendingUp, FileText, Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CreditControl, CreditCustomerRow, CreditOverride, SalesInvoiceList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiRequest } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { creditControl, creditHold, decideOverride, distributionOpsOptions, requestOverride } from "../api";

type Can = { approve: boolean; routes: boolean };
type Opt = { code: string; label: string };
const FALLBACK_REASONS: Opt[] = [
  { code: "OVER_LIMIT", label: "Over credit limit" }, { code: "OVERDUE", label: "Overdue balance" },
  { code: "BOUNCED_CHEQUE", label: "Bounced cheque" }, { code: "MANUAL", label: "Manual" },
];
const TYPE_LABEL: Record<string, string> = { ONE_TIME: "One-time (invoice)", TEMP_LIMIT: "Temporary limit", RELEASE_HOLD: "Release hold" };
const TYPE_ICON: Record<string, typeof FileText> = { ONE_TIME: FileText, TEMP_LIMIT: TrendingUp, RELEASE_HOLD: LockOpen };
const OV_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "warn" }, APPROVED: { label: "Approved", tone: "good" }, REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "neutral" }, USED: { label: "Used", tone: "info" },
};
const amt = (n: number) => Math.round(n).toLocaleString("en-US");
const rs = (n: number) => `Rs ${amt(n)}`;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function customerStatus(c: CreditCustomerRow): { label: string; tone: Tone } {
  if (c.status === "ON_HOLD") return { label: "On hold", tone: "danger" };
  if (c.overLimit) return { label: "Over limit", tone: "danger" };
  if (c.overdue > 0) return { label: "Overdue", tone: "warn" };
  return { label: "Good", tone: "good" };
}

/**
 * Template app/receivables/credit (41-acc-trade.html "Credit Control"): KPIs, the exposure watchlist (limit, balance,
 * utilisation, overdue, hold) with Place hold / Release, override approvals (one-time for a draft invoice, temporary
 * limit, release hold) approved by crovr:approve — never by the requester — and the recent hold / release events.
 */
export function CreditControlScreen({ can, userId }: { can: Can; userId: string }) {
  const toast = useToast();
  const [data, setData] = useState<CreditControl | null>(null);
  const [err, setErr] = useState<{ message: string; reference?: string } | null>(null);
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);
  const [reasons, setReasons] = useState<Opt[]>(FALLBACK_REASONS);
  const [q, setQ] = useState("");
  const [hold, setHold] = useState<{ row: CreditCustomerRow; place: boolean } | null>(null);
  const [decide, setDecide] = useState<{ o: CreditOverride; action: "approve" | "reject" } | null>(null);
  const [requesting, setRequesting] = useState<string | null | false>(false);
  const [historyOf, setHistoryOf] = useState<CreditOverride | null>(null);

  useEffect(() => {
    let off = false;
    creditControl().then((d) => { if (!off) { setData(d); setErr(null); } })
      .catch((e: unknown) => !off && setErr(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load credit control" }));
    return () => { off = true; };
  }, [n]);

  useEffect(() => {
    if (!can.routes) return;
    let off = false;
    distributionOpsOptions().then((o) => { if (!off && o.lookups.holdReasons.length) setReasons(o.lookups.holdReasons); }).catch(() => undefined);
    return () => { off = true; };
  }, [can.routes]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.customers ?? []).filter((c) => !s || c.customer.name.toLowerCase().includes(s) || c.customer.code.toLowerCase().includes(s));
  }, [data, q]);

  if (err && !data) return <ErrorState message={err.message} reference={err.reference} onRetry={reload} />;
  const k = data?.kpis;
  const pending = data?.overrides.filter((o) => o.status === "PENDING") ?? [];
  const decided = data?.overrides.filter((o) => o.status !== "PENDING").slice(0, 8) ?? [];
  const worst = data?.customers.find((c) => c.overLimit && (c.maxDaysOverdue ?? 0) > 90) ?? data?.customers.find((c) => c.overLimit);
  const onHoldExposure = data?.customers.filter((c) => c.status === "ON_HOLD").reduce((t, c) => t + c.balance, 0) ?? 0;
  const reasonLabel = (code: string) => reasons.find((r) => r.code === code)?.label ?? code.replace(/_/g, " ").toLowerCase();

  return (
    <>
      <PageHead
        eyebrow="Receivables / Credit Control"
        title="Credit Control"
        description="Monitor exposure against limits, manage credit holds and override approvals."
        actions={
          <>
            <Link className="btn secondary" href="/receivables/reminders"><Bell />Payment reminders</Link>
            <Button variant="primary" icon={<Plus />} onClick={() => setRequesting(null)}>Request override</Button>
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi red"><div className="kpi-top"><span>Over Credit Limit</span><span className="icon-well"><Gauge /></span></div><strong>{k ? k.overLimit : "—"}</strong><small className={k?.overLimit ? "down" : undefined}>{k ? (k.overLimit ? "Balance above the limit" : "All within limit") : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>On Credit Hold</span><span className="icon-well"><Lock /></span></div><strong>{k ? k.onHold : "—"}</strong><small>{k ? `${rs(onHoldExposure)} exposure` : " "}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Pending Overrides</span><span className="icon-well"><ShieldCheck /></span></div><strong>{k ? k.pendingOverrides : "—"}</strong><small>{k ? (k.pendingOverrides ? "Awaiting a credit approver" : "Nothing waiting") : " "}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Overdue Amount</span><span className="icon-well"><Bell /></span></div><strong>{k ? rs(k.overdueAmount) : "—"}</strong><small>{k ? "Past due date, all customers" : " "}</small></div>
      </div>

      {worst && (
        <div className="mb">
          <Banner tone="danger" title={`${worst.customer.name} exceeds its credit limit by ${rs(worst.balance - worst.creditLimit)}${(worst.maxDaysOverdue ?? 0) > 90 ? " with balances over 90 days" : ""}`}
            action={<Link className="btn sm secondary" href={`/customers/${worst.customer.id}`}>Open account</Link>}>
            {worst.status === "ON_HOLD" ? `On hold since ${worst.onHoldSince ? dateLabel(worst.onHoldSince.slice(0, 10)) : "—"}. New invoices are blocked until released or overridden.` : "Invoices over the limit are blocked at posting unless an override is approved."}
          </Banner>
        </div>
      )}

      <div className="panel flush mb">
        <div className="panel-head"><div><h3>Exposure watchlist</h3><p>Balance and overdue against each customer&apos;s credit limit</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        </div>
        {!data ? <div style={{ padding: 16 }}><Skeleton style={{ height: 240 }} /></div> : !rows.length ? (
          <EmptyState icon={<Gauge />} title={q ? "No customer matches" : "No exposure to watch"} description={q ? "Try another name or code." : "Customers with a balance, a credit limit or a hold appear here."} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Customer</th><th className="num">Limit</th><th className="num">Balance</th><th style={{ width: 150 }}>Utilisation</th><th className="num">Overdue</th><th className="num">Max days</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => {
                const st = customerStatus(c);
                const pct = c.usedPct ?? 0;
                return (
                  <tr key={c.customer.id}>
                    <td><div className="cell-user"><span className="avatar sm">{initials(c.customer.name)}</span><div><b>{c.customer.name}</b><small>{c.customer.code}{c.customer.city ? ` · ${c.customer.city}` : ""}</small></div></div></td>
                    <td className={c.creditLimit ? "num" : "num zero"}>{c.creditLimit ? amt(c.creditLimit) : "—"}</td>
                    <td className="num">{amt(c.balance)}</td>
                    <td>
                      {c.usedPct === null ? <small className="muted">No limit</small> : (
                        <>
                          <div className={pct >= 100 ? "progress danger" : pct >= 60 ? "progress warn" : "progress"}><i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} /></div>
                          <small className={pct >= 100 ? undefined : "muted"} style={pct >= 100 ? { color: "var(--danger)" } : undefined}>{Math.round(pct)}%</small>
                        </>
                      )}
                    </td>
                    <td className={c.overdue > 0 ? "num neg" : "num zero"}>{c.overdue > 0 ? amt(c.overdue) : "—"}</td>
                    <td className="num">{c.maxDaysOverdue && c.maxDaysOverdue > 0 ? c.maxDaysOverdue : "—"}</td>
                    <td><Badge tone={st.tone} dot>{st.label}</Badge>{c.status === "ON_HOLD" && c.holdReason && <small>{reasonLabel(c.holdReason)}</small>}</td>
                    <td className="actions">
                      {can.approve && (c.status === "ON_HOLD"
                        ? <Button size="sm" icon={<LockOpen />} onClick={() => setHold({ row: c, place: false })}>Release</Button>
                        : <Button size="sm" variant="ghost" icon={<Lock />} onClick={() => setHold({ row: c, place: true })}>Place hold</Button>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head"><div><h3>Override approvals</h3><p>Requests to exceed the limit or release a hold</p></div></div>
          {!data ? <Skeleton style={{ height: 200 }} /> : !pending.length && !decided.length ? (
            <EmptyState icon={<ShieldCheck />} title="No override requests" description="Requests to let an invoice through, raise a limit for a while or release a hold appear here." />
          ) : (
            <div className="list">
              {pending.map((o) => <OverrideItem key={o.id} o={o} can={can} userId={userId} onDecide={(action) => setDecide({ o, action })} onHistory={() => setHistoryOf(o)} />)}
              {decided.map((o) => <OverrideItem key={o.id} o={o} can={can} userId={userId} onDecide={() => undefined} onHistory={() => setHistoryOf(o)} />)}
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Hold events</h3><p>Holds placed and released, newest first</p></div></div>
          {!data ? <Skeleton style={{ height: 200 }} /> : !data.events.length ? (
            <EmptyState icon={<Lock />} title="No hold events yet" description="Placing or releasing a hold, a bounced cheque or an approved release is recorded here." />
          ) : (
            <div className="timeline">
              {data.events.slice(0, 12).map((e) => (
                <div key={e.id} className="tl-item">
                  <span className={e.eventType === "HOLD" ? "tl-dot danger" : "tl-dot"} />
                  <div>
                    <b>{e.eventType === "HOLD" ? "Hold" : "Released"} — {e.customer.name}</b>
                    <small>{reasonLabel(e.reason)} · {e.source.replace(/_/g, " ").toLowerCase()} · {dateLabel(e.occurredAt.slice(0, 10))}{e.user ? ` · ${e.user.name}` : ""}{e.notes ? ` · ${e.notes}` : ""}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {hold && <HoldModal row={hold.row} place={hold.place} reasons={reasons} onClose={() => setHold(null)}
        onDone={(d) => { setHold(null); setData(d); toast(hold.place ? `${hold.row.customer.name} put on hold` : `${hold.row.customer.name} released`, { tone: "good" }); }} />}
      {decide && <DecideModal o={decide.o} action={decide.action} onClose={() => setDecide(null)}
        onDone={(o) => { setDecide(null); toast(`${o.docNo} ${o.status === "APPROVED" ? "approved" : "rejected"}${o.status === "APPROVED" && o.invoice ? ` — ${o.invoice.docNo} can be posted` : ""}`, { tone: "good" }); reload(); }} />}
      {requesting !== false && data && <RequestModal customers={data.customers} preset={requesting} onClose={() => setRequesting(false)}
        onDone={(o) => { setRequesting(false); toast(`${o.docNo} requested`, { tone: "good" }); reload(); }} />}
      <Drawer open={!!historyOf} onClose={() => setHistoryOf(null)} title={historyOf ? historyOf.docNo : "Override"} subtitle={historyOf ? `${historyOf.customer.name} · ${TYPE_LABEL[historyOf.overrideType] ?? historyOf.overrideType}` : undefined}>
        {historyOf && (
          <>
            <div className="dl mb">
              <div><span>Credit limit</span><b>{rs(historyOf.creditLimit)}</b></div>
              <div><span>Balance at request</span><b>{rs(historyOf.balance)}</b></div>
              {historyOf.documentAmount > 0 && <div><span>Document</span><b>{rs(historyOf.documentAmount)}</b></div>}
              {historyOf.exceedBy > 0 && <div><span>Exceeds limit by</span><b style={{ color: "var(--danger)" }}>{rs(historyOf.exceedBy)}</b></div>}
              {historyOf.tempLimitAmount !== null && <div><span>Temporary limit</span><b>{rs(historyOf.tempLimitAmount)}{historyOf.validUntil ? ` until ${dateLabel(historyOf.validUntil)}` : ""}</b></div>}
              <div><span>Reason</span><b>{historyOf.requestReason}</b></div>
              {historyOf.conditionComments && <div><span>Decision comment</span><b>{historyOf.conditionComments}</b></div>}
            </div>
            <HistoryTab schema="Sales" table="CreditOverrides" id={historyOf.id} />
          </>
        )}
      </Drawer>
    </>
  );
}

function OverrideItem({ o, can, userId, onDecide, onHistory }: { o: CreditOverride; can: Can; userId: string; onDecide: (a: "approve" | "reject") => void; onHistory: () => void }) {
  const Icon = TYPE_ICON[o.overrideType] ?? FileText;
  const st = OV_STATUS[o.status] ?? { label: o.status, tone: "neutral" as Tone };
  const head = o.overrideType === "ONE_TIME"
    ? `${o.customer.name} — ${o.invoice?.docNo ?? "invoice"} · ${rs(o.documentAmount)}`
    : o.overrideType === "TEMP_LIMIT" ? `${o.customer.name} — temporary limit ${rs(o.tempLimitAmount ?? 0)}` : `${o.customer.name} — release hold`;
  const own = o.requestedBy?.id === userId;
  return (
    <div className="list-item">
      <span className="icon-well"><Icon /></span>
      <div>
        <b>{head}</b>
        <small>
          {o.exceedBy > 0 ? `Exceeds limit by ${rs(o.exceedBy)} · ` : ""}{o.requestReason} · requested by {o.requestedBy?.name ?? "—"}, {dateLabel(o.requestedAt.slice(0, 10))}
          {o.decidedBy ? ` · ${o.status === "APPROVED" ? "approved" : "decided"} by ${o.decidedBy.name}` : ""}
        </small>
      </div>
      <span className="spacer" />
      <button type="button" className="icon-btn-sm" title="History" onClick={onHistory}><History /></button>
      {o.status === "PENDING" && can.approve ? (
        own ? <small className="muted">Your request — another approver decides</small> : (
          <>
            <Button size="sm" onClick={() => onDecide("reject")}>Reject</Button>
            <Button size="sm" variant="primary" onClick={() => onDecide("approve")}>Approve</Button>
          </>
        )
      ) : <Badge tone={st.tone} dot>{st.label}</Badge>}
    </div>
  );
}

function HoldModal({ row, place, reasons, onClose, onDone }: { row: CreditCustomerRow; place: boolean; reasons: Opt[]; onClose: () => void; onDone: (d: CreditControl) => void }) {
  const [reason, setReason] = useState(place ? (row.overLimit ? "OVER_LIMIT" : row.overdue > 0 ? "OVERDUE" : "MANUAL") : (reasons.find((r) => r.code === "PAYMENT_RECEIVED") ? "PAYMENT_RECEIVED" : "MANUAL"));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDone(await creditHold(row.customer.id, place ? "place" : "release", reason, notes.trim() || null));
    } catch (e) {
      setErr(errMsg(e, place ? "Could not place the hold" : "Could not release the hold"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={place ? "Place credit hold" : "Release credit hold"} subtitle={`${row.customer.name} · balance ${rs(row.balance)}${row.creditLimit ? ` of ${rs(row.creditLimit)}` : ""}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={place ? "btn danger" : "btn primary"} onClick={() => void go()} disabled={busy}>{busy ? "Working…" : place ? "Place hold" : "Release hold"}</button></>}>
      {place && <div className="mb"><Banner tone="warn" title="New invoices will be blocked">Posting an invoice for this customer fails until the hold is released or an override is approved.</Banner></div>}
      <FormGrid cols={1}>
        <Field label="Reason" required><select value={reason} onChange={(e) => setReason(e.target.value)}>{reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select></Field>
        <Field label="Notes" error={err ?? undefined}><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>
      </FormGrid>
    </Modal>
  );
}

function DecideModal({ o, action, onClose, onDone }: { o: CreditOverride; action: "approve" | "reject"; onClose: () => void; onDone: (o: CreditOverride) => void }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const after = o.balance + o.documentAmount;
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDone(await decideOverride(o.id, action, comment.trim() || null));
    } catch (e) {
      setErr(e instanceof ApiError && e.code === "CREDIT_OVERRIDE_SELF_APPROVAL" ? "You can’t approve your own override request; another credit approver has to." : errMsg(e, "Could not record the decision"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={action === "approve" ? "Approve credit override" : "Reject credit override"} subtitle={`${o.customer.name}${o.invoice ? ` · ${o.invoice.docNo}` : ""} · ${TYPE_LABEL[o.overrideType] ?? o.overrideType}`}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className={action === "approve" ? "btn primary" : "btn danger"} onClick={() => void go()} disabled={busy}>{busy ? "Working…" : action === "approve" ? "Approve override" : "Reject"}</button></>}>
      <div className="dl">
        <div><span>Credit limit</span><b>{rs(o.creditLimit)}</b></div>
        <div><span>Current balance</span><b>{rs(o.balance)}</b></div>
        {o.documentAmount > 0 && <div><span>This invoice</span><b>{rs(o.documentAmount)}</b></div>}
        {o.documentAmount > 0 && <div><span>Exposure after posting</span><b style={o.exceedBy > 0 ? { color: "var(--danger)" } : undefined}>{rs(after)}{o.creditLimit ? ` (${Math.round((after / o.creditLimit) * 100)}%)` : ""}</b></div>}
        {o.tempLimitAmount !== null && <div><span>Temporary limit</span><b>{rs(o.tempLimitAmount)}{o.validUntil ? ` until ${dateLabel(o.validUntil)}` : ""}</b></div>}
        <div><span>Requested by</span><b>{o.requestedBy?.name ?? "—"} · {o.requestReason}</b></div>
      </div>
      <FormGrid cols={1}>
        <Field label="Condition / comments" error={err ?? undefined}><textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={action === "approve" ? "e.g. subject to cheque for the overdue balance by Friday" : "Why is it rejected?"} /></Field>
      </FormGrid>
    </Modal>
  );
}

function RequestModal({ customers, preset, onClose, onDone }: { customers: CreditCustomerRow[]; preset: string | null; onClose: () => void; onDone: (o: CreditOverride) => void }) {
  const [customerId, setCustomerId] = useState(preset ?? "");
  const [type, setType] = useState<"ONE_TIME" | "TEMP_LIMIT" | "RELEASE_HOLD">("ONE_TIME");
  const [invoiceId, setInvoiceId] = useState("");
  const [limit, setLimit] = useState("");
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [drafts, setDrafts] = useState<SalesInvoiceList["items"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const cust = customers.find((c) => c.customer.id === customerId);

  useEffect(() => {
    if (!customerId || type !== "ONE_TIME") return;
    let off = false;
    apiRequest<SalesInvoiceList>(`/sales/invoices?customer=${customerId}&status=DRAFT&pageSize=100`)
      .then((l) => !off && setDrafts(l.items.filter((i) => i.status === "DRAFT")))
      .catch(() => !off && setDrafts([]));
    return () => { off = true; };
  }, [customerId, type]);

  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDone(await requestOverride({
        customerId, overrideType: type, invoiceId: type === "ONE_TIME" ? invoiceId || null : null,
        tempLimitAmount: type === "TEMP_LIMIT" ? Number(limit.replace(/,/g, "")) || null : null, validUntil: type === "TEMP_LIMIT" ? until || null : null, requestReason: reason.trim(),
      }));
    } catch (e) {
      setErr({ message: errMsg(e, "Could not request the override"), fields: e instanceof ApiError ? Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])) : {} });
    } finally {
      setBusy(false);
    }
  };
  const ready = customerId && reason.trim().length >= 3 && (type !== "ONE_TIME" || invoiceId) && (type !== "TEMP_LIMIT" || (limit && until));
  return (
    <Modal open onClose={onClose} title="Request credit override" subtitle="A credit approver (not you) decides"
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void go()} disabled={busy || !ready}>{busy ? "Working…" : "Send request"}</button></>}>
      {err && !Object.keys(err.fields).length && <div className="mb"><Banner tone="danger" title={err.message} /></div>}
      <FormGrid>
        <Field label="Customer" required error={err?.fields.customerId} full>
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(""); setDrafts(null); }}>
            <option value="">Choose…</option>
            {customers.map((c) => <option key={c.customer.id} value={c.customer.id}>{c.customer.name} · {c.customer.code}</option>)}
          </select>
        </Field>
        <Field label="Override type" required full>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="ONE_TIME">One-time (this draft invoice)</option>
            <option value="TEMP_LIMIT">Temporary limit increase</option>
            <option value="RELEASE_HOLD">Release credit hold</option>
          </select>
        </Field>
        {type === "ONE_TIME" && (
          <Field label="Draft invoice" required error={err?.fields.invoiceId} full>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!customerId}>
              <option value="">{!customerId ? "Choose the customer first" : drafts === null ? "Loading…" : drafts.length ? "Choose…" : "No draft invoice for this customer"}</option>
              {(drafts ?? []).map((i) => <option key={i.id} value={i.id}>{i.docNo} · {dateLabel(i.docDate)} · {rs(i.netAmount)}</option>)}
            </select>
          </Field>
        )}
        {type === "TEMP_LIMIT" && (
          <>
            <Field label="Temporary limit (Rs)" required error={err?.fields.tempLimitAmount}><input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
            <Field label="Valid until" required error={err?.fields.validUntil}><input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          </>
        )}
        {cust && (
          <div className="dl" style={{ gridColumn: "1 / -1" }}>
            <div><span>Credit limit</span><b>{cust.creditLimit ? rs(cust.creditLimit) : "No limit"}</b></div>
            <div><span>Balance</span><b>{rs(cust.balance)}</b></div>
            <div><span>Overdue</span><b>{cust.overdue ? rs(cust.overdue) : "—"}</b></div>
            <div><span>Status</span><b>{customerStatus(cust).label}</b></div>
          </div>
        )}
        <Field label="Reason" required error={err?.fields.requestReason} full><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why should this go through?" /></Field>
      </FormGrid>
    </Modal>
  );
}
