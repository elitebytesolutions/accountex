"use client";

import { Banknote, CircleCheck, Clock, Download, Image as ImageIcon, MoreHorizontal, Receipt, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CLAIM_REJECT_REASONS, type CashOptions, type ExpenseClaim, type ExpenseClaimList } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay, Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { approveClaim, cashOptions, getClaim, listClaims, payApprovedClaims, payClaim, rejectClaim } from "../api";

type Can = { post: boolean; approve: boolean };
type Row = ExpenseClaimList["items"][number];
const PAGE = 15;
const CHIPS = [{ label: "All", status: "", count: (c: Record<string, number>) => Object.values(c).reduce((s, n) => s + n, 0) },
  { label: "Pending", status: "PENDING", count: (c: Record<string, number>) => (c.PENDING ?? 0) + (c.OVER_POLICY ?? 0) },
  { label: "Approved", status: "APPROVED", count: (c: Record<string, number>) => c.APPROVED ?? 0 },
  { label: "Paid", status: "PAID", count: (c: Record<string, number>) => c.PAID ?? 0 },
  { label: "Rejected", status: "REJECTED", count: (c: Record<string, number>) => c.REJECTED ?? 0 }];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING: { label: "Pending", tone: "warn" }, OVER_POLICY: { label: "Over policy", tone: "danger" }, APPROVED: { label: "Approved", tone: "good" },
  PAID: { label: "Paid", tone: "info" }, REJECTED: { label: "Rejected", tone: "danger" }, WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};
const REASON: Record<string, string> = {
  MISSING_RECEIPT: "Missing or unclear receipt", EXCEEDS_POLICY: "Exceeds policy limit", NOT_BUSINESS: "Not a business expense", DUPLICATE: "Duplicate claim",
  WRONG_COST_CENTRE: "Wrong cost centre", OTHER: "Other",
};
const PERIOD: Record<string, string> = { PER_CLAIM: "per claim", PER_TRIP: "per trip", PER_DAY: "per day", PER_NIGHT: "per night", PER_MEAL: "per meal", PER_MONTH: "per month" };
const ACTION: Record<string, string> = {
  SUBMITTED: "Submitted", RESUBMITTED: "Resubmitted", MANAGER_APPROVED: "Line manager approved", APPROVED: "Approved", APPROVED_WITH_EXCEPTION: "Approved with exception",
  REJECTED: "Rejected", WITHDRAWN: "Withdrawn", PAID: "Paid", COMMENTED: "Comment",
};
const STAGES = ["SENT", "MANAGER", "FINANCE", "PAID"] as const;
const STAGE_LABEL: Record<string, string> = { SENT: "Sent", MANAGER: "Manager", FINANCE: "Finance", PAID: "Paid" };
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const isPending = (c: { status: string }) => c.status === "PENDING" || c.status === "OVER_POLICY";

function ClaimStatus({ c }: { c: Pick<Row, "status" | "isOverPolicy"> }) {
  const s = isPending(c) && c.isOverPolicy ? STATUS.OVER_POLICY! : STATUS[c.status] ?? { label: c.status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

/** Template app/cash/expenses (40-acc-core.html): KPIs, claims table, detail panel, reject modal, pay and pay-approved. */
export function ExpenseClaimsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExpenseClaimList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(() => params.get("claim"));
  const [detail, setDetail] = useState<ExpenseClaim | null>(null);
  const [options, setOptions] = useState<CashOptions | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [reject, setReject] = useState<ExpenseClaim | null>(null);
  const [pay, setPay] = useState<{ ids: string[]; total: number; label: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    cashOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listClaims({ status, search, page, pageSize: PAGE })
      .then((l) => {
        if (cancelled) return;
        setData(l);
        setError(null);
        // the detail panel follows the first pending claim until one is picked
        setDetailId((d) => d ?? l.items.find(isPending)?.id ?? l.items[0]?.id ?? null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load expense claims" }));
    return () => { cancelled = true; };
  }, [status, search, page, attempt]);
  useEffect(() => {
    if (!detailId) return;
    let cancelled = false;
    getClaim(detailId).then((c) => !cancelled && setDetail(c)).catch(() => !cancelled && setDetail(null));
    return () => { cancelled = true; };
  }, [detailId, attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const items = useMemo(() => (data?.items ?? []).filter((c) => !dept || c.employee.department === dept), [data, dept]);
  const departments = useMemo(() => [...new Set((data?.items ?? []).map((c) => c.employee.department).filter((d): d is string => !!d))].sort(), [data]);
  const k = data?.kpis;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const approvedSelected = items.filter((c) => selected.has(c.id) && c.status === "APPROVED");
  const allApproved = items.filter((c) => c.status === "APPROVED");

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doApprove = async (id: string) => {
    setBusy(id);
    try {
      const c = await approveClaim(id);
      toast(`${c.docNo} ${c.status === "APPROVED" ? (c.isOverPolicy ? "approved with exception · accrual posted" : "approved · accrual posted") : "approved · on to the next step"}`, { tone: "good" });
      setDetailId(id);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not approve the claim", { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const openReject = async (id: string) => {
    try { setReject(detail?.id === id ? detail : await getClaim(id)); } catch (e) { toast(e instanceof ApiError ? e.message : "Could not load the claim", { tone: "danger" }); }
  };
  const exportCsv = () => downloadCsv(`expense-claims-${isoDay(new Date())}.csv`, [
    ["Claim #", "Title", "Employee", "Department", "Category", "Submitted", "Receipts", "Amount", "Status"],
    ...items.map((c) => [c.docNo, c.title, c.employee.name, c.employee.department ?? "", c.category.name, c.submittedAt?.slice(0, 10) ?? "", c.receiptCount, c.totalAmount, STATUS[c.status]?.label ?? c.status]),
  ]);

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Cash / Expense Claims"
        title="Expense Claims"
        description="Employee reimbursement claims submitted via My Profile — review receipts, approve and pay."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>Export</Button>
            {can.post && (
              <Button variant="primary" icon={<Banknote />} disabled={!allApproved.length} onClick={() => {
                const list = approvedSelected.length ? approvedSelected : allApproved;
                setPay({ ids: list.map((c) => c.id), total: list.reduce((s, c) => s + (c.approvedAmount ?? c.totalAmount), 0), label: `${list.length} approved claim${list.length === 1 ? "" : "s"}` });
              }}>Pay approved</Button>
            )}
          </>
        }
      />

      <div className="kpi-grid mb">
        <div className="kpi yellow"><div className="kpi-top"><span>Awaiting approval</span><span className="icon-well"><Clock /></span></div><strong>{k?.awaiting ?? "—"}</strong><small>{k ? rs(k.awaitingAmount) : " "}</small></div>
        <div className="kpi"><div className="kpi-top"><span>Approved · unpaid</span><span className="icon-well"><CircleCheck /></span></div><strong>{k?.approvedUnpaid ?? "—"}</strong><small>{k ? rs(k.approvedUnpaidAmount) : " "}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Paid this month</span><span className="icon-well"><Banknote /></span></div><strong>{k ? <Money value={k.paidThisMonth} dec={0} /> : "—"}</strong><small>{data ? `${data.counts.PAID ?? 0} paid claim${data.counts.PAID === 1 ? "" : "s"} in all` : " "}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>Policy exceptions</span><span className="icon-well"><ShieldAlert /></span></div><strong>{k?.overPolicy ?? "—"}</strong><small className={cn(k && k.overPolicy > 0 && "down")}>Pending over the category limit</small></div>
      </div>

      <div className="split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Claims</h3><p>Submitted by employees · latest first</p></div></div>
          <div className="toolbar">
            <label className="search-field"><Search /><input placeholder="Search claim # or title…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
            <div className="chips">
              {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => { setStatus(c.status); setPage(1); setSelected(new Set()); }}>{c.label} <i>{data ? c.count(data.counts) : 0}</i></button>)}
            </div>
            <span className="spacer" />
            <select value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department">
              <option value="">All departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {!data ? <Skeleton style={{ height: 360 }} /> : !items.length ? (
            <EmptyState icon={<Receipt />} title={status || search || dept ? "No claims match" : "No expense claims yet"} description={status || search || dept ? "Try another status, department or search." : "Employees file claims from My Profile › Expense Claims."} />
          ) : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all" checked={items.length > 0 && items.every((c) => selected.has(c.id))} onChange={(e) => setSelected(e.target.checked ? new Set(items.map((c) => c.id)) : new Set())} /></th>
                <th>Claim #</th><th>Employee</th><th>Category</th><th>Submitted</th><th>Receipts</th><th className="num">Amount</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer", ...(c.id === detailId ? { background: "var(--primary-soft)" } : {}) }} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input")) setDetailId(c.id); }}>
                    <td><input type="checkbox" aria-label={`Select ${c.docNo}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                    <td><b><Hl text={c.docNo} q={search} /></b><small><Hl text={c.title} q={search} /></small></td>
                    <td><div className="cell-user"><span className="avatar sm">{initials(c.employee.name)}</span><div><b>{c.employee.name}</b><small>{c.employee.department ?? "—"}</small></div></div></td>
                    <td>{c.category.name}</td>
                    <td>{c.submittedAt ? dateLabel(c.submittedAt.slice(0, 10)) : "—"}</td>
                    <td><Badge><ImageIcon /> {c.receiptCount}</Badge></td>
                    <td className="num">{amt(c.approvedAmount ?? c.totalAmount)}</td>
                    <td><ClaimStatus c={c} /></td>
                    <td className="actions">
                      {isPending(c) ? (
                        <>
                          <Button size="sm" variant="primary" disabled={busy === c.id} onClick={() => doApprove(c.id)}>{busy === c.id ? "…" : "Approve"}</Button>{" "}
                          <Button size="sm" variant="ghost" onClick={() => openReject(c.id)}>Reject</Button>
                        </>
                      ) : c.status === "APPROVED" && can.post ? (
                        <Button size="sm" onClick={() => setPay({ ids: [c.id], total: c.approvedAmount ?? c.totalAmount, label: c.docNo })}>Pay</Button>
                      ) : (
                        <button type="button" className="icon-btn-sm" aria-label={`Actions for ${c.docNo}`} onClick={(e) => setMenu({ anchor: e.currentTarget, items: [{ label: "Open", onClick: () => setDetailId(c.id) }] })}><MoreHorizontal /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {data && data.total > 0 && (
            <div className="table-foot">
              <span>Showing {items.length} of {data.total} claim{data.total === 1 ? "" : "s"}{selected.size ? ` · ${selected.size} selected` : ""}</span>
              <div className="pager">
                <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹</button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => <button key={p} type="button" className={cn(p === page && "active")} onClick={() => setPage(p)}>{p}</button>)}
                <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>›</button>
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          {detailId && !detail ? <div className="panel"><Skeleton style={{ height: 320 }} /></div> : detail ? (
            <ClaimDetail claim={detail} can={can} busy={busy === detail.id} onApprove={() => doApprove(detail.id)} onReject={() => setReject(detail)} onPay={() => setPay({ ids: [detail.id], total: detail.approvedAmount ?? detail.totalAmount, label: detail.docNo })} />
          ) : (
            <div className="panel"><EmptyState icon={<Receipt />} title="Pick a claim" description="Its receipts, items, policy check and approval chain show here." /></div>
          )}
        </div>
      </div>

      <Menu anchor={menu?.anchor ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <RejectModal key={`reject-${reject?.id ?? "none"}`} claim={reject} onClose={() => setReject(null)} onDone={(c) => { setReject(null); toast(`${c.docNo} rejected`, { tone: "good" }); setDetailId(c.id); reload(); }} />
      <PayModal key={`pay-${pay ? pay.ids.join(",") : "none"}`} pay={pay} options={options} onClose={() => setPay(null)} onDone={(msg) => { setPay(null); setSelected(new Set()); toast(msg, { tone: "good" }); reload(); }} />
    </>
  );
}

/** The claim's detail panel: receipts, items, policy, approval chain and stage tracker, actions. */
function ClaimDetail({ claim: c, can, busy, onApprove, onReject, onPay }: { claim: ExpenseClaim; can: Can; busy: boolean; onApprove: () => void; onReject: () => void; onPay: () => void }) {
  const stageIx = c.status === "PAID" ? 3 : STAGES.indexOf(c.workflowStage as (typeof STAGES)[number]);
  const manager = c.actions.find((a) => a.action === "MANAGER_APPROVED");
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>{c.docNo} · {c.employee.name}</h3><p>{c.title}{c.tripFrom ? ` · ${dateLabel(c.tripFrom).slice(0, 6)}${c.tripTo && c.tripTo !== c.tripFrom ? `–${dateLabel(c.tripTo).slice(0, 6)}` : ""}` : ""}</p></div><ClaimStatus c={c} /></div>
      <div className="row mb" style={{ gap: 4, flexWrap: "wrap" }} aria-label="Claim stage">
        {STAGES.map((s, i) => {
          const stopped = c.status === "REJECTED" || c.status === "WITHDRAWN";
          const tone: Tone = i < stageIx || c.status === "PAID" ? "good" : i === stageIx ? (stopped ? "danger" : "warn") : "neutral";
          return <span key={s} className="row" style={{ gap: 4 }}>{i > 0 && <span className="muted">›</span>}<Badge tone={tone} dot={i === stageIx && !stopped && c.status !== "PAID"}>{STAGE_LABEL[s]}</Badge></span>;
        })}
      </div>
      <div className="grid-3 mb">
        {Array.from({ length: Math.min(3, Math.max(1, c.receiptCount)) }, (_, i) => (
          <div key={i} className="card" style={{ padding: 8, textAlign: "center" }}><span className="icon-well lg"><ImageIcon /></span><small className="muted" style={{ display: "block" }}>{c.receiptCount ? `Receipt ${i + 1}` : "No receipts"}</small></div>
        ))}
      </div>
      <small className="muted" style={{ display: "block", marginTop: -6, marginBottom: 10 }}>{c.receiptCount} receipt{c.receiptCount === 1 ? "" : "s"} held · images arrive with document storage</small>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Item</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {c.lines.map((l) => <tr key={l.id}><td>{l.description}{l.merchant ? <small>{l.merchant}</small> : null}</td><td className="num">{amt(l.amount)}</td></tr>)}
          <tr className="total"><td>Total claim</td><td className="num">{amt(c.totalAmount)}</td></tr>
          {c.approvedAmount !== null && c.approvedAmount !== c.totalAmount && <tr><td>Approved amount</td><td className="num">{amt(c.approvedAmount)}</td></tr>}
        </tbody>
      </table></div>
      <div className="dl mt">
        <div><span>Policy limit</span><b>{c.policyLimitAmount ? `${rs(c.policyLimitAmount)} ${PERIOD[c.policyLimitPeriod ?? ""] ?? ""}` : "No limit"}{c.isOverPolicy ? " · over" : ""}</b></div>
        {c.policyJustification && <div><span>Justification</span><b>{c.policyJustification}</b></div>}
        <div><span>Customer</span><b>{c.customer?.name ?? "—"}</b></div>
        <div><span>Charge to</span><b>{c.chargeAccount ? `${c.chargeAccount.code} ${c.chargeAccount.name}` : `${c.category.name} account`}{c.costCentre ? ` — ${c.costCentre.name}` : ""}</b></div>
        <div><span>Line manager</span><b>{manager ? `Approved — ${manager.actor?.name ?? ""}` : c.workflowStage === "MANAGER" ? "Waiting" : "—"}</b></div>
        {c.rejectionReason && <div><span>Rejected</span><b>{REASON[c.rejectionReason] ?? c.rejectionReason}{c.rejectionComment ? ` — ${c.rejectionComment}` : ""}</b></div>}
        {c.approvalVoucher && <div><span>Accrual</span><b><Link href={`/accounting/vouchers/${c.approvalVoucher.id}`}>{c.approvalVoucher.docNo}</Link></b></div>}
        {c.paymentVoucher && <div><span>Payment</span><b><Link href={`/accounting/vouchers/${c.paymentVoucher.id}`}>{c.paymentVoucher.docNo}</Link>{c.paymentMethod ? ` · ${c.paymentMethod === "CASH" ? "cash" : "bank transfer"}` : ""}</b></div>}
      </div>
      {c.actions.length > 0 && (
        <div className="mt">
          <small className="muted" style={{ display: "block", marginBottom: 6 }}>Approval chain</small>
          {c.actions.map((a) => (
            <div key={a.id} className="row small" style={{ padding: "3px 0" }}>
              <span>{ACTION[a.action] ?? a.action}{a.actor ? ` — ${a.actor.name}` : ""}{a.comment ? `: ${a.comment}` : ""}</span>
              <span className="spacer" /><span className="muted">{dateLabel(a.actedAt.slice(0, 10)).slice(0, 6)}</span>
            </div>
          ))}
        </div>
      )}
      {(isPending(c) || (c.status === "APPROVED" && can.post)) && (
        <div className="form-actions">
          {isPending(c) && <><Button size="sm" onClick={onReject}>Reject</Button><Button size="sm" variant="primary" disabled={busy} onClick={onApprove}>{busy ? "Approving…" : "Approve"}</Button></>}
          {c.status === "APPROVED" && can.post && <Button size="sm" variant="primary" icon={<Banknote />} onClick={onPay}>Pay</Button>}
        </div>
      )}
    </div>
  );
}

/** Template acc-reject-claim. */
function RejectModal({ claim, onClose, onDone }: { claim: ExpenseClaim | null; onClose: () => void; onDone: (c: ExpenseClaim) => void }) {
  const [reason, setReason] = useState<string>("MISSING_RECEIPT");
  const [comment, setComment] = useState("");
  const [allow, setAllow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!claim) return;
    setBusy(true);
    setErr(null);
    try { onDone(await rejectClaim(claim.id, { reason, comment: comment.trim() || null, allowResubmit: allow })); } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not reject the claim"); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!claim} onClose={onClose} title="Reject expense claim" subtitle="The employee sees the reason in My Profile." foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn danger" onClick={run} disabled={busy}>{busy ? "Rejecting…" : "Reject claim"}</button></>
    }>
      <FormGrid>
        <Field label="Reason" required full error={err ?? undefined}>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{CLAIM_REJECT_REASONS.map((r) => <option key={r} value={r}>{REASON[r]}</option>)}</select>
        </Field>
        <Field label="Comment to employee" full><textarea rows={3} placeholder="Explain what needs to change…" value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <Check full label="Allow employee to resubmit" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
      </FormGrid>
    </Modal>
  );
}

/** Pays one claim or a batch of approved claims by cash (CPV) or bank transfer (BPV). */
function PayModal({ pay, options, onClose, onDone }: { pay: { ids: string[]; total: number; label: string } | null; options: CashOptions | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER">("BANK_TRANSFER");
  const [cash, setCash] = useState("");
  const [bank, setBank] = useState("");
  const [date, setDate] = useState(isoDay(new Date()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cashId = cash || options?.cashAccounts.find((c) => c.kind !== "PETTY" && c.kind !== "IMPREST")?.id || "";
  const bankId = bank || options?.bankAccounts[0]?.id || "";
  const run = async () => {
    if (!pay) return;
    setBusy(true);
    setErr(null);
    const body = { method, cashAccountId: method === "CASH" ? cashId : null, bankAccountId: method === "BANK_TRANSFER" ? bankId : null, date };
    try {
      if (pay.ids.length === 1) {
        const c = await payClaim(pay.ids[0]!, body);
        onDone(`${c.docNo} paid · ${c.paymentVoucher?.docNo ?? "posted"}`);
      } else {
        const r = await payApprovedClaims({ ids: pay.ids, ...body });
        onDone(r.failed.length ? `${r.paid.length} paid · ${r.failed.length} failed: ${r.failed[0]!.message}` : `${r.paid.length} claims paid`);
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not pay");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!pay} onClose={onClose} title={pay && pay.ids.length > 1 ? "Pay approved claims" : `Pay ${pay?.label ?? ""}`} subtitle={pay ? `${pay.label} · ${rs(pay.total)} · Dr employee claims payable` : undefined} foot={
      <><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={run} disabled={busy}>{busy ? "Paying…" : "Pay"}</button></>
    }>
      <FormGrid>
        <Field label="Method" required>
          <select value={method} onChange={(e) => setMethod(e.target.value as "CASH" | "BANK_TRANSFER")}>
            <option value="BANK_TRANSFER">Bank transfer (BPV)</option><option value="CASH">Cash (CPV)</option><option value="PAYROLL" disabled>With payroll — arrives with payroll runs</option>
          </select>
        </Field>
        <Field label="Date" required><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {method === "CASH" ? (
          <Field label="Pay from" required full error={err ?? undefined}>
            <select value={cashId} onChange={(e) => setCash(e.target.value)}>{options?.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.name} — {rs(c.balance)}</option>)}</select>
          </Field>
        ) : (
          <Field label="Pay from" required full error={err ?? undefined}>
            <select value={bankId} onChange={(e) => setBank(e.target.value)}>{options?.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}{b.last4 ? ` — ${b.last4}` : ""}</option>)}</select>
          </Field>
        )}
      </FormGrid>
    </Modal>
  );
}
