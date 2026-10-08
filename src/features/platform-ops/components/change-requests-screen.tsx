"use client";

import {
  ArrowUpRight, Check, CircleCheck, CircleX, Clock, Eye, FileDiff, Flag, Inbox, MessageSquare, PartyPopper, Play, Quote, Send, ShieldCheck, Timer, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChangeRequest, ChangeRequestList } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { Avatar, EnvDot, TypeBadge, envCss, envLabel } from "@/features/platform-flags/components/flag-ui";
import { cancelChangeRequest, commentChangeRequest, decideChangeRequest, listChangeRequests, runSchedule } from "../api";
import { Diff, diffStats, fmtWhen, useLoad } from "./ops-ui";

type Tab = "PENDING" | "APPROVED" | "REJECTED" | "ALL";
const CRS: Record<string, [string, string]> = { PENDING: ["Pending", "warn"], APPROVED: ["Approved", "good"], REJECTED: ["Rejected", "danger"], CANCELLED: ["Cancelled", "neutral"] };
const fmtDur = (m: number | null) => (m === null ? "—" : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`);

/**
 * Template admin/change-requests (3B-flags.html, 9J-flags.js 1652–1754): KPIs, status tabs, request cards and the review
 * drawer (diff, approvals, discussion, required approver note, Approve & apply / Reject). Solo approval: while the
 * admin is the only platform staff member, their own request is decided with the typed flag key and a note.
 */
export function ChangeRequestsScreen({ initialOpen }: { initialOpen?: string }) {
  const toast = useToast();
  const router = useRouter();
  const { data, error, reload } = useLoad(() => listChangeRequests("ALL"), "Could not load change requests");
  const [tab, setTab] = useState<Tab>("PENDING");
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const items = data?.items ?? [];
  const cnt = (s: Tab) => (s === "ALL" ? items.length : items.filter((c) => c.status === s).length);
  const list = items.filter((c) => tab === "ALL" || c.status === tab);
  const open = items.find((c) => c.id === openId) ?? null;

  const run = async () => {
    setBusy(true);
    try {
      const r = await runSchedule();
      toast(`Schedule run: ${r.requested.length} requested, ${r.applied.length} applied${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`, { tone: r.skipped.length ? "warn" : "good", ms: 6000 });
      reload();
    } catch (e) { toast(adminErrorMessage(e, "Could not run the schedule"), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/admin/features">Feature Management</Link> / Change Requests</>} title="Change Requests"
        description="Every Production change to a flag needs a second approver. Review the diff, talk it through and approve or reject."
        actions={<>
          <span className="tagline">four eyes on prod</span>
          <button type="button" className="icon-btn" disabled={busy} onClick={run} aria-label="Run schedule now" title="Run schedule now: applies due approved requests and opens requests for ramp steps due today"><Play /></button>
          <Link className="btn secondary" href="/admin/features"><Flag />Flags</Link>
        </>} />

      <div className="kpi-grid ff-kpis">
        <div className="kpi"><div className="kpi-top"><span>Pending</span><span className="icon-well yellow"><Clock /></span></div><strong>{data ? data.kpis.pending : "…"}</strong><small>{data?.solo ? "You are the only admin: solo approval allowed" : "Need a second approver"}</small></div>
        <div className="kpi"><div className="kpi-top"><span>Approved · 30 days</span><span className="icon-well"><CircleCheck /></span></div><strong>{data ? data.kpis.approved30d : "…"}</strong><small>Applied to Production</small></div>
        <div className="kpi"><div className="kpi-top"><span>Rejected · 30 days</span><span className="icon-well red"><CircleX /></span></div><strong>{data ? data.kpis.rejected30d : "…"}</strong><small>Sent back with a note</small></div>
        <div className="kpi"><div className="kpi-top"><span>Median time to approve</span><span className="icon-well violet"><Timer /></span></div><strong>{data ? fmtDur(data.kpis.medianApproveMinutes) : "…"}</strong><small>Last 30 days</small></div>
      </div>

      <div className="tabs ff-crtabs" role="tablist">
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as Tab[]).map((s) => (
          <button key={s} type="button" role="tab" className={cn(tab === s && "active")} onClick={() => setTab(s)}>{s === "ALL" ? "All" : CRS[s]![0]} <i>{cnt(s)}</i></button>
        ))}
      </div>

      <div className="ff-crlist">
        {!data ? <Skeleton style={{ height: 160 }} /> : list.length === 0 ? (
          <div className="empty-state ff-empty panel"><span className="icon-well lg">{tab === "PENDING" ? <PartyPopper /> : <Inbox />}</span><b>{tab === "PENDING" ? "Inbox zero" : "Nothing here yet"}</b>
            <small>{tab === "PENDING" ? "No Production changes are waiting for you." : "Requests will show up here."}</small><Link className="btn secondary sm" href="/admin/features">Go to flags</Link></div>
        ) : list.map((c, i) => <CrCard key={c.id} c={c} i={i} onOpen={() => setOpenId(c.id)} />)}
      </div>

      {open && data && <CrDrawer key={`${open.id}-${open.rowVersion}-${open.comments.length}`} c={open} list={data} onClose={() => { setOpenId(null); router.replace("/admin/change-requests"); }} onChanged={reload} />}
    </>
  );
}

function CrCard({ c, i, onOpen }: { c: ChangeRequest; i: number; onOpen: () => void }) {
  const [label, tone] = CRS[c.status] ?? [c.status, "neutral"];
  const s = diffStats(c.beforeState, c.afterState);
  return (
    <article className={cn("ff-cr", `s-${c.status.toLowerCase()}`)} style={{ ["--i" as string]: i }} tabIndex={0} onClick={(e) => !(e.target as HTMLElement).closest("a,button") && onOpen()} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onOpen()}>
      <div className="ff-cr-top"><span className="ff-crid">{c.docNo}</span><code className="ff-key">{c.flagKey}</code><span className={cn("ff-envchip", `e-${envCss(c.environment)}`)}><EnvDot env={c.environment} />{envLabel(c.environment)}</span>
        <span className={cn("badge dot", tone)}>{c.scheduled ? "Approved · scheduled" : label}</span>{c.source === "SCHEDULE_STEP" && <span className="badge violet">Ramp step</span>}<span className="spacer" /><small className="ff-when"><Clock />{fmtWhen(c.createdAt)}</small></div>
      <div className="ff-cr-body"><Avatar name={c.requesterName} size="sm" /><div>
        <div className="ff-cr-what"><b>{c.requesterName}</b> requested <b>{c.summary}</b> on <span className="ff-cr-fname">{c.flagName}</span></div>
        <p className="ff-reason">“{c.reason}”</p>
        <div className="ff-cr-meta"><span className="ff-sbdiff"><b className="add">+{s.add}</b><b className="del">−{s.del}</b></span>
          <span className="ff-appr"><span className="avatar-stack">{c.approvers.map((a) => <Avatar key={a.staffId} name={a.name} />)}</span>{c.status === "PENDING" ? `Needs 1 of ${c.approvers.length || 1}` : c.status === "APPROVED" ? `Approved by ${c.decidedBy}` : c.status === "REJECTED" ? `Rejected by ${c.decidedBy}` : "Cancelled"}</span>
          <span><MessageSquare />{c.comments.length}</span>{c.flagType && <TypeBadge type={c.flagType} sm />}</div>
      </div></div>
      <div className="ff-cr-act"><button type="button" className={cn("btn sm", c.status === "PENDING" ? "primary" : "secondary")} onClick={onOpen}>{c.status === "PENDING" ? <><Eye />Review</> : <><FileDiff />View diff</>}</button></div>
    </article>
  );
}

function CrDrawer({ c, list, onClose, onChanged }: { c: ChangeRequest; list: ChangeRequestList; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [key, setKey] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [history, setHistory] = useState(false);
  const [label, tone] = CRS[c.status] ?? [c.status, "neutral"];
  const mine = c.requesterStaffId === list.meStaffId;
  const solo = mine && list.solo;
  const pending = c.status === "PENDING";

  const decide = async (approve: boolean) => {
    if (!note.trim()) { setInvalid(true); toast(approve ? "Add a second-approver note before approving" : "Tell the requester why", { tone: "warn" }); return; }
    if (solo && key.trim() !== c.flagKey) { toast(`Type ${c.flagKey} to confirm your solo decision`, { tone: "warn" }); return; }
    setBusy(true);
    try {
      const r = await decideChangeRequest(c.id, approve ? "approve" : "reject", note.trim(), solo ? key.trim() : undefined);
      toast(approve ? (r.appliedAt ? `${c.docNo} approved · ${c.flagKey} updated in ${envLabel(c.environment)}` : `${c.docNo} approved · applies after ${fmtWhen(r.applyNotBefore)}`) : `${c.docNo} rejected`, { tone: approve ? "good" : "warn" });
      onChanged(); onClose();
    } catch (e) { toast(adminErrorMessage(e, "Could not record the decision"), { tone: "danger", ms: 7000 }); }
    finally { setBusy(false); }
  };
  const post = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try { await commentChangeRequest(c.id, comment.trim()); setComment(""); onChanged(); }
    catch (e) { toast(adminErrorMessage(e, "Could not post the comment"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await cancelChangeRequest(c.id); toast(`${c.docNo} withdrawn`, { tone: "info" }); onChanged(); onClose(); }
    catch (e) { toast(adminErrorMessage(e, "Could not cancel the request"), { tone: "danger" }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Drawer open onClose={onClose} wide className="ff-drawer" title={`${c.docNo} · ${c.flagKey}`} subtitle={`${envLabel(c.environment)} · requested by ${c.requesterName} · ${fmtWhen(c.createdAt)}`}
        foot={pending ? <>
          <button type="button" className="btn danger" disabled={busy} onClick={() => decide(false)}><X />Reject</button>
          {mine && <button type="button" className="btn ghost" disabled={busy} onClick={cancel}>Withdraw</button>}
          <span className="spacer" /><button type="button" className="btn secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => decide(true)}><Check />{busy ? "Applying…" : "Approve & apply"}</button>
        </> : <><button type="button" className="btn ghost" onClick={() => setHistory(true)}>History</button><span className="spacer" />{c.scheduled && mine && <button type="button" className="btn ghost" disabled={busy} onClick={cancel}>Cancel scheduled change</button>}<button type="button" className="btn secondary" onClick={onClose}>Close</button></>}>
        <div className="ff-crd">
          <div className="ff-crd-top"><span className={cn("badge dot", tone)}>{c.scheduled ? "Approved · scheduled" : label}</span><span className={cn("ff-envchip", `e-${envCss(c.environment)}`)}><EnvDot env={c.environment} />{envLabel(c.environment)}</span>
            {c.flagType && <TypeBadge type={c.flagType} sm />}<span className="spacer" /><Link className="link" href={`/admin/features/${c.flagId}?env=${c.environment}`}>Open flag<ArrowUpRight /></Link></div>
          <div className="ff-crd-sum"><b>{c.summary}</b><p>“{c.reason}”</p>{c.applyNotBefore && <small><Clock /> Not before {fmtWhen(c.applyNotBefore)} PKT</small>}{c.appliedAt && <small><CircleCheck /> Applied {fmtWhen(c.appliedAt)}</small>}</div>
          <h4 className="ff-h4">Diff</h4><Diff before={c.beforeState} after={c.afterState} />
          <h4 className="ff-h4">Approvals</h4>
          <div className="ff-apprlist">
            {c.approvers.map((a) => (
              <div key={a.staffId} className="ff-apr"><Avatar name={a.name} size="sm" /><div><b>{a.name}</b><small>{a.decision === "WAITING" ? (a.staffId === c.requesterStaffId ? "Requester · only platform admin" : "Requested reviewer") : `${CRS[a.decision]?.[0] ?? a.decision} · ${fmtWhen(a.decidedAt)}`}</small></div>
                <span className={cn("badge", a.decision === "APPROVED" ? "good" : a.decision === "REJECTED" ? "danger" : "neutral")}>{a.decision === "WAITING" ? "Waiting" : CRS[a.decision]?.[0]}</span></div>
            ))}
          </div>
          {c.decisionNote && <div className={cn("ff-decnote", c.status.toLowerCase())}><Quote /><div><b>{c.decidedBy}&apos;s note</b><p>{c.decisionNote}</p></div></div>}
          <h4 className="ff-h4">Discussion</h4>
          <div className="ff-thread">{c.comments.length ? c.comments.map((m) => (
            <div key={m.id} className={cn("ff-cm", m.staffId === list.meStaffId && "me")}><Avatar name={m.staffName} /><div><div className="ff-cm-h"><b>{m.staffName}</b><small>{fmtWhen(m.postedAt)}</small></div><p>{m.body}</p></div></div>
          )) : <div className="ff-cm-empty">No comments yet. Ask a question or add context.</div>}</div>
          <div className="ff-cmin"><input placeholder="Write a comment…" aria-label="Comment" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void post(); } }} />
            <button type="button" className="btn secondary sm" disabled={busy || !comment.trim()} onClick={post}><Send />Post</button></div>
          {pending && (
            <div className="ff-decide">
              {solo && <div className="banner warn ff-banner"><ShieldCheck /><div><b>Solo approval.</b> You are the only platform admin, so you may decide your own request. Type <code className="ff-key">{c.flagKey}</code> and a note; it is recorded as a solo approval.</div></div>}
              {solo && <label className="field"><span>Type <b className="ff-mono">{c.flagKey}</b> to confirm</span><input className="ff-mono-in" autoComplete="off" spellCheck={false} value={key} placeholder={c.flagKey} onChange={(e) => setKey(e.target.value)} /></label>}
              {mine && !list.solo && <div className="banner info ff-banner"><ShieldCheck /><div>This is your request: another platform admin must approve it.</div></div>}
              <label className="field"><span>{solo ? "Solo approval note *" : "Second-approver note *"}</span>
                <textarea rows={3} className={cn(invalid && "ff-invalid")} placeholder="What you checked: dashboards, error rates, tenants affected…" value={note} onChange={(e) => { setNote(e.target.value); setInvalid(false); }} /></label>
              <small><ShieldCheck />Approving applies the change to {envLabel(c.environment)} {c.applyNotBefore ? `once ${fmtWhen(c.applyNotBefore)} has passed` : "immediately"} and records your note in the audit log.</small>
            </div>
          )}
        </div>
      </Drawer>
      <Modal open={history} onClose={() => setHistory(false)} title="Change request history" subtitle={c.docNo} wide>
        <AdminHistoryTab table="FlagChangeRequests" id={c.id} labels={{ FlagChangeRequestApprovers: "Approver", FlagChangeRequestComments: "Comment" }} />
      </Modal>
    </>
  );
}
