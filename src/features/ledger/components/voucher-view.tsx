"use client";

import {
  ArrowLeft, CalendarRange, Check, Copy, CornerUpLeft, FileStack, Link2, Paperclip, Pencil, Printer, Repeat, Scale, Send, Trash2, Undo2, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { ApprovalStep, GlOptions, Voucher } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormGrid, Textarea } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { dateLabel, Money } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import {
  approvalAct, approvalComment, commentVoucher, deleteVoucher, duplicateVoucher, getVoucher, postVoucher, recallVoucher, reverseVoucher, submitVoucher,
  voucherOptions, voucherPrinted,
} from "../api";
import { amt, errMsg, periodLabel, REASON_LABEL, stampLabel, StatusBadge, typeUi, VoucherActModal } from "./vouchers-ui";

type Can = { create: boolean; edit: boolean; post: boolean; remove: boolean };
const ACTIVITY_TONE: Record<string, Tone> = {
  CREATED: "good", EDITED: "neutral", ATTACHMENT: "neutral", SUBMITTED: "info", APPROVED: "good", SENT_BACK: "warn", POSTED: "good", REVERSED: "danger",
  COMMENT: "violet", PRINTED: "neutral", DUPLICATED: "neutral",
};
const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
const ACT_LABEL: Record<string, string> = { SUBMIT: "Submitted", RESUBMIT: "Resubmitted", APPROVE: "Approved", REJECT: "Rejected", REQUEST_CHANGES: "Changes requested", DELEGATE: "Delegated", CANCEL: "Recalled", COMMENT: "Comment" };

/** Template app/accounting/vouchers/view (40-acc-core.html): header, ledger entries, audit trail, approval, attachments, related. */
export function VoucherView({ id, userId, can }: { id: string; userId: string; can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const [v, setV] = useState<Voucher | null>(null);
  const [options, setOptions] = useState<GlOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; status?: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [act, setAct] = useState<"post" | "reverse" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVoucher(id)
      .then((x) => {
        if (cancelled) return;
        setV(x);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, status: e.status } : { message: "Could not load the voucher" }));
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);
  useEffect(() => {
    voucherOptions().then(setOptions).catch(() => setOptions(null));
  }, []);
  const reload = () => setAttempt((n) => n + 1);

  const run = async (label: string, fn: () => Promise<unknown>, after?: (r: unknown) => void) => {
    setBusy(true);
    try {
      const r = await fn();
      toast(label, { tone: "good" });
      if (after) after(r);
      else reload();
    } catch (e) {
      toast(errMsg(e, "Something went wrong"), { tone: "danger" });
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (error && !v) {
    if (error.status === 404) return <EmptyState icon={<FileStack />} title="Voucher not found" description="It may have been a draft that was deleted." action={<ButtonLink href="/accounting/vouchers" icon={<ArrowLeft />}>Voucher register</ButtonLink>} />;
    return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  }
  if (!v) {
    return (
      <div className="split">
        <div className="stack"><Skeleton style={{ height: 160 }} /><Skeleton style={{ height: 260 }} /></div>
        <div className="stack"><Skeleton style={{ height: 110 }} /><Skeleton style={{ height: 240 }} /></div>
      </div>
    );
  }

  const t = typeUi(v.voucherType);
  const editable = v.voucherType !== "OB" && v.voucherType !== "SYSTEM";
  const ap = v.approval;
  const approvedPending = v.status === "PENDING_APPROVAL" && ap?.status === "APPROVED";
  const pendingAp = ap?.status === "PENDING" && v.status === "PENDING_APPROVAL";
  const created = v.activities.find((a) => a.action === "CREATED");
  const costCentres = [...new Set(v.lines.map((l) => l.costCentre?.name).filter(Boolean))];
  const target = { id: v.id, docNo: v.docNo, voucherType: v.voucherType, status: v.status, postingDate: v.postingDate, totalDebit: v.totalDebit, lineCount: v.lines.length, rowVersion: v.rowVersion };

  const print = () => {
    voucherPrinted(v.id).catch(() => undefined);
    window.print();
  };
  const decide = (action: "approve" | "reject" | "request-changes") => {
    const text = comment.trim() || null;
    if (action !== "approve" && !text) {
      toast("Write the reason in the comment box first", { tone: "warn" });
      return;
    }
    const label = action === "approve" ? "Approved" : action === "reject" ? `Rejected — sent back to ${v.preparedBy?.name ?? "the preparer"}` : `Sent back to ${v.preparedBy?.name ?? "the preparer"}`;
    run(label, () => approvalAct(ap!.id, action, { reason: action === "approve" ? null : text, comment: action === "approve" ? text : null }), () => { setComment(""); reload(); });
  };
  const addComment = () => {
    const text = comment.trim();
    if (!text) return;
    run("Comment added", () => (pendingAp ? approvalComment(ap!.id, text) : commentVoucher(v.id, text)), () => { setComment(""); reload(); });
  };

  const actions: ReactNode[] = [
    <ButtonLink key="back" variant="ghost" icon={<ArrowLeft />} href="/accounting/vouchers">Register</ButtonLink>,
    <Button key="print" icon={<Printer />} onClick={print}>Print</Button>,
  ];
  if (can.create && editable) actions.push(<Button key="dup" icon={<Copy />} disabled={busy} onClick={() => run("Duplicated as a new draft", () => duplicateVoucher(v.id), (r) => router.push(`/accounting/vouchers/${(r as Voucher).id}`))}>Duplicate</Button>);
  if (v.status === "DRAFT") {
    if (can.remove) actions.push(<Button key="del" icon={<Trash2 />} disabled={busy} onClick={() => setRemoving(true)}>Delete</Button>);
    if (can.edit && editable) actions.push(<ButtonLink key="edit" icon={<Pencil />} href={`/accounting/vouchers/${v.id}/edit`}>Edit</ButtonLink>);
    if (v.routing && can.create) actions.push(<Button key="sub" variant="primary" icon={<Send />} disabled={busy} onClick={() => run(`Submitted to ${v.routing!.workflow.name}`, () => submitVoucher(v.id, v.rowVersion))}>Submit for approval</Button>);
    else if (can.post) actions.push(<Button key="post" variant="primary" icon={<Send />} disabled={busy} onClick={() => setAct("post")}>Post</Button>);
  }
  if (v.status === "PENDING_APPROVAL") {
    if (v.preparedBy?.id === userId && !approvedPending) actions.push(<Button key="recall" icon={<CornerUpLeft />} disabled={busy} onClick={() => run("Recalled to draft", () => recallVoucher(v.id, v.rowVersion))}>Recall</Button>);
    if (pendingAp && ap.canAct) actions.push(<Button key="appr" variant="primary" icon={<Check />} disabled={busy} onClick={() => decide("approve")}>Approve</Button>);
    if (approvedPending && can.post) actions.push(<Button key="post" variant="primary" icon={<Send />} disabled={busy} onClick={() => setAct("post")}>Post</Button>);
  }
  if (v.status === "POSTED" && can.post && editable) actions.push(<Button key="rev" variant="danger" icon={<Undo2 />} disabled={busy} onClick={() => setAct("reverse")}>Reverse</Button>);

  const steps: ApprovalStep[] = ap?.steps ?? v.routing?.steps ?? [];
  const notes = (ap?.actions ?? []).filter((a) => a.comment || a.reason);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Accounting / Vouchers / {v.docNo}</div>
          <h1>{v.docNo} <StatusBadge status={v.status} long />{approvedPending && <> <Badge tone="info">Approved · ready to post</Badge></>}</h1>
          <p>{t.name} · {v.narration} · {v.branch.name}</p>
        </div>
        <div className="head-actions">{actions}</div>
      </div>

      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="grid-3">
              <div className="dl">
                <div><span>Voucher type</span><b>{t.name.replace(/^./, (c) => c.toUpperCase())}</b></div>
                <div><span>Voucher date</span><b>{dateLabel(v.postingDate)}</b></div>
                <div><span>Fiscal period</span><b>{v.fiscalPeriod ? `${v.fiscalPeriod.code} · ${title(v.fiscalPeriod.status)}` : periodLabel(options, v.postingDate)}</b></div>
              </div>
              <div className="dl">
                <div><span>Reference</span><b>{v.referenceNo ?? "—"}</b></div>
                <div><span>Branch</span><b>{v.branch.name}</b></div>
                <div><span>{v.cashBankAccount ? (v.voucherType.startsWith("C") ? "Cash account" : "Bank account") : "Cost centre"}</span><b>{v.cashBankAccount ? `${v.cashBankAccount.code} ${v.cashBankAccount.name}` : costCentres.length ? costCentres.join(", ") : "—"}</b></div>
              </div>
              <div className="dl">
                <div><span>Created by</span><b>{v.preparedBy?.name ?? "System"}{created ? ` · ${stampLabel(created.occurredAt).slice(0, 6)} ${stampLabel(created.occurredAt).slice(-5)}` : ""}</b></div>
                <div><span>{v.postedAt ? "Posted" : "Submitted"}</span><b>{stampLabel(v.postedAt ?? v.submittedAt)}</b></div>
                <div><span>Currency</span><b>{v.currencyCode}</b></div>
              </div>
            </div>
            {(v.partyName || v.instrumentNo || v.autoReverseOn || v.reversalReason) && (
              <div className="grid-3 mt">
                <div className="dl">{v.partyName && <div><span>{v.voucherType.endsWith("RV") ? "Received from" : "Paid to"}</span><b>{v.partyName}</b></div>}</div>
                <div className="dl">{v.instrumentNo && <div><span>{v.instrumentType ? title(v.instrumentType) : "Instrument"}</span><b>{v.instrumentNo}{v.instrumentDate ? ` · ${dateLabel(v.instrumentDate)}` : ""}</b></div>}</div>
                <div className="dl">
                  {v.autoReverseOn && <div><span>Auto-reverses on</span><b>{dateLabel(v.autoReverseOn)}</b></div>}
                  {v.reversalReason && <div><span>Reversal reason</span><b>{REASON_LABEL[v.reversalReason] ?? v.reversalReason}</b></div>}
                </div>
              </div>
            )}
            <div className="form-section mt"><h4>Narration</h4><p>{v.narration}</p>{v.remarks && <p className="muted">{v.remarks}</p>}{v.reversalRemarks && <p className="muted">{v.reversalRemarks}</p>}</div>
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Ledger entries</h3><p>{v.lines.length} lines</p></div><div className="panel-actions"><Link className="btn ghost sm" href="/accounting/ledger">View in ledger</Link></div></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>#</th><th>Account</th><th>Particulars</th><th>Cost centre</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                <tbody>
                  {v.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.lineNo}</td>
                      <td><b>{l.account.code}</b> {l.account.name}{l.isAutoContra && <> <Badge tone="info">Auto</Badge></>}</td>
                      <td>{l.particulars ?? "—"}</td>
                      <td>{l.costCentre?.name ?? "—"}</td>
                      <td className={l.debit ? "num dr" : "num zero"}>{l.debit ? amt(l.debit) : "—"}</td>
                      <td className={l.credit ? "num cr" : "num zero"}>{l.credit ? amt(l.credit) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="total"><td colSpan={4}>Total</td><td className="num">{amt(v.totalDebit)}</td><td className="num">{amt(v.totalCredit)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Audit trail</h3><p>Every action on this voucher</p></div></div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
                <tbody>
                  {[...v.activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((a) => (
                    <tr key={a.id}>
                      <td>{stampLabel(a.occurredAt)}</td>
                      <td>{a.user?.name ?? "System"}</td>
                      <td><Badge tone={ACTIVITY_TONE[a.action] ?? "neutral"}>{title(a.action)}</Badge></td>
                      <td>{a.detail ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Change history</h3><p>Every saved version of this voucher and who made it</p></div></div>
            <HistoryTab schema="Accounting" table="Vouchers" id={v.id} />
          </div>
        </div>

        <div className="stack">
          <div className="kpi teal"><div className="kpi-top"><span>Voucher amount</span><span className="icon-well"><Scale /></span></div><strong><Money value={v.totalDebit} dec={0} /></strong><small>{Math.round(v.totalDebit * 100) === Math.round(v.totalCredit * 100) ? "Balanced" : "Unbalanced"} · {v.lines.length} lines</small></div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>Approval</h3>
                <p>{ap ? `${ap.workflow.name} · ${title(ap.status)}` : v.routing ? `${v.routing.workflow.name} · submit to start` : "No workflow applies"}</p>
              </div>
            </div>
            <div className="timeline">
              <div className="tl-item"><span className="tl-dot good" /><div><b>Prepared — {v.preparedBy?.name ?? "System"}</b><small>{created ? stampLabel(created.occurredAt) : dateLabel(v.docDate)}</small></div></div>
              {v.submittedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Submitted for approval</b><small>{stampLabel(v.submittedAt)}</small></div></div>}
              {steps.map((s) => (
                <div className="tl-item" key={s.stepNo}>
                  <span className={`tl-dot${s.state === "done" ? " good" : s.state === "current" ? " warn" : ""}`} />
                  <div>
                    <b>{s.name} — {s.approvers.length ? s.approvers.map((a) => a.name).join(", ") : "No approver"}{s.mode === "ALL" && s.approvers.length > 1 ? " (all)" : ""}</b>
                    <small>
                      {s.state === "done" ? `Approved by ${s.actedBy.map((a) => `${a.name} · ${stampLabel(a.at)}`).join(", ")}`
                        : s.state === "current" ? (pendingAp ? (ap.canAct ? "Awaiting your approval" : "Awaiting approval") : ap ? title(ap.status) : "First step")
                          : s.state === "skipped" ? `Not required${s.appliesAboveAmount !== null ? ` — applies above Rs ${s.appliesAboveAmount.toLocaleString("en-US")}` : ""}`
                            : s.appliesAboveAmount !== null ? `Required above Rs ${s.appliesAboveAmount.toLocaleString("en-US")}` : "Waiting"}
                    </small>
                  </div>
                </div>
              ))}
              {!ap && !v.routing && v.status === "DRAFT" && <div className="tl-item"><span className="tl-dot" /><div><b>Post directly</b><small>No approval workflow matches this voucher</small></div></div>}
              {v.postedAt && <div className="tl-item"><span className="tl-dot good" /><div><b>Posted{v.postedBy ? ` — ${v.postedBy.name}` : ""}</b><small>{stampLabel(v.postedAt)}</small></div></div>}
              {v.status === "REVERSED" && <div className="tl-item"><span className="tl-dot danger" /><div><b>Reversed{v.reversedBy ? ` by ${v.reversedBy}` : ""}</b><small>{dateLabel(v.reversalDate)}</small></div></div>}
            </div>
            {notes.length > 0 && (
              <div className="list mt">
                {notes.slice(-4).map((n) => (
                  <div className="list-item" key={n.id}><div><b>{n.actor?.name ?? "—"} · {ACT_LABEL[n.action] ?? title(n.action)}</b><small>{n.reason ?? n.comment}{n.reason && n.comment ? ` — ${n.comment}` : ""} · {stampLabel(n.actedAt)}</small></div></div>
                ))}
              </div>
            )}
            {v.status !== "REVERSED" && (
              <>
                <FormGrid cols={1}>
                  <Field label="Comment" full>
                    <Textarea rows={2} value={comment} maxLength={1000} placeholder={pendingAp && ap.canAct ? "Add a note for the preparer…" : "Add a comment to this voucher…"} onChange={(e) => setComment(e.target.value)} />
                  </Field>
                </FormGrid>
                <div className="form-actions">
                  {pendingAp && ap.canAct ? (
                    <>
                      <Button size="sm" icon={<X />} disabled={busy} onClick={() => decide("reject")}>Reject</Button>
                      <Button size="sm" disabled={busy} onClick={() => decide("request-changes")}>Send back</Button>
                      <Button size="sm" variant="primary" icon={<Check />} disabled={busy} onClick={() => decide("approve")}>Approve</Button>
                    </>
                  ) : (
                    <Button size="sm" disabled={busy || !comment.trim()} onClick={addComment}>Add comment</Button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Attachments</h3><p>0 files</p></div></div>
            <EmptyState icon={<Paperclip />} title="No attachments" description="Attaching files to vouchers arrives in a later phase." />
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Related</h3></div></div>
            <div className="list">
              {v.reversalOfId && <Link className="list-item" href={`/accounting/vouchers/${v.reversalOfId}`}><span className="icon-well"><Link2 /></span><div><b>{v.reversalOf ?? "Original voucher"}</b><small>Reversed by this voucher</small></div></Link>}
              {v.reversedById && <Link className="list-item" href={`/accounting/vouchers/${v.reversedById}`}><span className="icon-well"><Undo2 /></span><div><b>{v.reversedBy ?? "Reversal"}</b><small>Reversal · {dateLabel(v.reversalDate)}</small></div></Link>}
              {v.recurringTemplate && <Link className="list-item" href="/accounting/recurring"><span className="icon-well"><Repeat /></span><div><b>{v.recurringTemplate.name}</b><small>Recurring template</small></div></Link>}
              {v.sourceDocType === "OB" && <Link className="list-item" href="/accounting/opening"><span className="icon-well"><FileStack /></span><div><b>Opening balances</b><small>Posted from the opening trial balance</small></div></Link>}
              {v.fiscalPeriod && <Link className="list-item" href="/periods"><span className="icon-well"><CalendarRange /></span><div><b>{v.fiscalPeriod.code}</b><small>Fiscal period · {title(v.fiscalPeriod.status)}</small></div></Link>}
              {!v.reversalOfId && !v.reversedById && !v.recurringTemplate && v.sourceDocType !== "OB" && !v.fiscalPeriod && <div className="list-item"><div><b>Nothing linked yet</b><small>The fiscal period is assigned when the voucher is posted</small></div></div>}
            </div>
          </div>
        </div>
      </div>

      {act && (
        <VoucherActModal
          mode={act}
          target={target}
          options={options}
          onClose={() => setAct(null)}
          onPost={async (postingDate) => {
            await postVoucher(v.id, v.rowVersion, postingDate);
            setAct(null);
            toast(`${v.docNo} posted to the general ledger`, { tone: "good" });
            reload();
          }}
          onReverse={async (body) => {
            const r = await reverseVoucher(v.id, { ...body, rowVersion: v.rowVersion });
            setAct(null);
            toast(`Reversal ${r.docNo} posted`, { tone: "warn" });
            router.push(`/accounting/vouchers/${r.id}`);
          }}
        />
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Delete ${v.docNo}?`}
        confirmLabel="Delete draft"
        danger
        busy={busy}
        onConfirm={() => run(`${v.docNo} deleted`, () => deleteVoucher(v.id, v.rowVersion), () => router.push("/accounting/vouchers"))}
      >
        The draft and its lines are removed. Posted vouchers are never deleted; they are reversed.
      </ConfirmDialog>
    </>
  );
}
