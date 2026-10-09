"use client";

import {
  AlarmClock, ArrowLeftRight, ArrowUpRight, Banknote, BookOpenCheck, Check, CheckCheck, ChevronRight, CircleCheck, CircleDashed, Coins, FileText, GitBranch,
  HandCoins, Hourglass, Inbox, Landmark, LayoutDashboard, LayoutGrid, List, MessageSquareReply, Paperclip, PartyPopper, Send, UserPlus, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ApprovalDetail, ApprovalItem, SessionUser } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead, Panel } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { avatarClass } from "@/features/access/components/access-ui";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { apiRequest } from "@/lib/api/client";
import { approvalAct, approvalBulk, approvalComment, approvalDelegate, approvalDelegates, approvalDetail, approvalInbox } from "../api";

/** Document types that route through approvals (template T map, 9A-company-plus.js). */
const T: Record<string, { label: string; one: string; icon: LucideIcon; tile: string }> = {
  JV: { label: "Journal vouchers", one: "Journal voucher", icon: BookOpenCheck, tile: "green" },
  CPV: { label: "Cash payments", one: "Cash payment", icon: Banknote, tile: "orange" },
  CRV: { label: "Cash receipts", one: "Cash receipt", icon: HandCoins, tile: "lime" },
  BPV: { label: "Bank payments", one: "Bank payment", icon: Landmark, tile: "blue" },
  BRV: { label: "Bank receipts", one: "Bank receipt", icon: Landmark, tile: "violet" },
  CON: { label: "Contra vouchers", one: "Contra voucher", icon: ArrowLeftRight, tile: "green" },
};
const typeOf = (t: string) => T[t] ?? { label: t, one: t, icon: FileText, tile: "blue" };
const REJECT_REASONS = ["Missing supporting documents", "Over budget", "Wrong account / cost centre", "Duplicate request"];
const CHANGE_REASONS = ["Attach supporting documents", "Split across cost centres", "Correct the tax code", "Add narration"];
const BULK_REASON = "Rejected in bulk, please resubmit with backup";

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-PK");
const rs = (n: number) => `${n < 0 ? "−" : ""}Rs ${fmt(n)}`;
const ageTxt = (h: number) => { const x = Math.max(0, Math.round(h)); return x < 24 ? `${x}h` : `${Math.floor(x / 24)}d ${x % 24}h`; };
const hoursSince = (iso: string, now: number) => (now - new Date(iso).getTime()) / 3600_000;
const slaHours = (it: ApprovalItem, now: number) => (it.currentStepDueAt ? (new Date(it.currentStepDueAt).getTime() - now) / 3600_000 : null);
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");

function Avatar({ name, size = "xs" }: { name: string; size?: string }) {
  return <span className={cn("avatar", size, avatarClass(name))} title={name}>{initialsOf(name)}</span>;
}

function SlaChip({ h }: { h: number | null }) {
  if (h === null) return <span className="badge neutral dot">No SLA</span>;
  if (h < 0) return <span className="badge danger dot">SLA breached {ageTxt(-h)}</span>;
  if (h <= 4) return <span className="badge warn dot">Due in {Math.max(1, Math.round(h))}h</span>;
  return <span className="badge good dot">{Math.round(h)}h left</span>;
}

const STATUS_TONE: Record<string, string> = { PENDING: "warn", APPROVED: "good", REJECTED: "danger", CHANGES_REQUESTED: "info", CANCELLED: "neutral" };
const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

type Thread = { id: string; who: string; at: string; text: string; tag?: string; ts: number };
/** The document's comments merged with the reasons / comments recorded on the request's actions, oldest first. */
function threadOf(d: ApprovalDetail): Thread[] {
  const tag: Record<string, string> = { REJECT: "Rejected", REQUEST_CHANGES: "Changes requested", APPROVE: "Approved", DELEGATE: "Delegated", CANCEL: "Withdrawn", SUBMIT: "Submitted", RESUBMIT: "Resubmitted" };
  return d.actions
    .filter((a) => a.reason || a.comment)
    .map((a): Thread => ({ id: a.id, who: a.actor?.name ?? "System", at: when(a.actedAt), text: [a.reason, a.comment].filter(Boolean).join(" · "), tag: tag[a.action], ts: new Date(a.actedAt).getTime() }))
    .concat(d.comments.map((c) => ({ id: `c-${c.id}`, who: c.by?.name ?? "System", at: when(c.at), text: c.text, ts: new Date(c.at).getTime() })))
    .sort((a, b) => a.ts - b.ts);
}

export function ApprovalsScreen() {
  const toast = useToast();
  const [inbox, setInbox] = useState<Awaited<ReturnType<typeof approvalInbox>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<SessionUser | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [focus, setFocus] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkRej, setBulkRej] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; mode?: "reject" } | null>(null);
  const [feature, setFeature] = useState<ApprovalDetail | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await approvalInbox();
      setInbox(data);
      setNow(Date.now());
      setError(null);
      setSel((s) => new Set([...s].filter((id) => data.items.some((i) => i.id === id))));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect
    apiRequest<SessionUser>("/auth/me").then(setMe, () => setMe(null));
  }, [load]);

  const items = useMemo(() => inbox?.items ?? [], [inbox]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; items.forEach((x) => (c[x.entityType] = (c[x.entityType] ?? 0) + 1)); return c; }, [items]);
  const activeFilter = filter !== "all" && !counts[filter] ? "all" : filter;
  // The largest request leads as the feature card (template "big" card) when the inbox has a few.
  const filtered = useMemo(() => items.filter((x) => activeFilter === "all" || x.entityType === activeFilter), [items, activeFilter]);
  const bigId = filtered.length >= 4 && view === "cards" ? [...filtered].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]!.id : null;
  const visible = useMemo(() => (bigId ? [filtered.find((x) => x.id === bigId)!, ...filtered.filter((x) => x.id !== bigId)] : filtered), [filtered, bigId]);
  useEffect(() => {
    if (!bigId) return;
    let live = true;
    approvalDetail(bigId).then((d) => live && setFeature(d), () => live && setFeature(null));
    return () => { live = false; };
  }, [bigId]);

  const toggleSel = (id: string, on?: boolean) => setSel((s) => { const n = new Set(s); if (on ?? !n.has(id)) n.add(id); else n.delete(id); return n; });

  const approve = useCallback(async (it: ApprovalItem) => {
    setBusy(it.id);
    try {
      const d = await approvalAct(it.id, "approve", { reason: null, comment: null });
      toast(`${it.docLabel} ${d.status === "APPROVED" ? "approved" : "approved, routed to the next approver"}`, { tone: "good" });
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  }, [load, toast]);

  async function bulkApprove() {
    const ids = items.filter((x) => sel.has(x.id)).map((x) => x.id);
    if (!ids.length) return;
    setBulkProgress(`Approving ${ids.length}`);
    try {
      const r = await approvalBulk({ ids, action: "approve", reason: null });
      if (r.done.length) toast(`${r.done.length} document${r.done.length === 1 ? "" : "s"} approved`, { tone: "good" });
      if (r.failed.length) toast(`${r.failed.length} not approved: ${r.failed[0]!.message}`, { tone: "danger" });
      setSel(new Set());
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBulkProgress(null);
    }
  }

  async function bulkReject() {
    const ids = [...sel];
    setBulkProgress(`Rejecting ${ids.length}`);
    try {
      const r = await approvalBulk({ ids, action: "reject", reason: BULK_REASON });
      if (r.done.length) toast(`${r.done.length} document${r.done.length === 1 ? "" : "s"} rejected`, { tone: "danger" });
      if (r.failed.length) toast(`${r.failed.length} not rejected: ${r.failed[0]!.message}`, { tone: "warn" });
      setSel(new Set());
      setBulkRej(false);
      await load();
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBulkProgress(null);
    }
  }

  // Template keyboard shortcuts: J/K move, A approve, R reject, X select, Enter open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || open || bulkRej) return;
      if ((e.target as HTMLElement).closest?.("input, textarea, select, [contenteditable='true']")) return;
      if (!visible.length) return;
      const k = e.key.toLowerCase();
      const cur = visible[Math.min(focus, visible.length - 1)];
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(f + 1, visible.length - 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => Math.max(f - 1, 0)); }
      else if (k === "a" && cur) { e.preventDefault(); void approve(cur); }
      else if (k === "r" && cur) { e.preventDefault(); setOpen({ id: cur.id, mode: "reject" }); }
      else if (k === "x" && cur) { e.preventDefault(); toggleSel(cur.id); }
      else if (e.key === "Enter" && cur && !(e.target as HTMLElement).closest?.(".cp-ap-card")) { e.preventDefault(); setOpen({ id: cur.id }); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, focus, open, bulkRej, approve]);

  useEffect(() => {
    bodyRef.current?.querySelectorAll<HTMLElement>("[data-id]")[focus]?.scrollIntoView?.({ block: "nearest" });
  }, [focus]);

  const selItems = items.filter((x) => sel.has(x.id));
  const allSel = visible.length > 0 && visible.every((x) => sel.has(x.id));
  const someSel = !allSel && visible.some((x) => sel.has(x.id));
  const kpis = inbox?.kpis;
  const focusIdx = Math.min(focus, Math.max(0, visible.length - 1));

  const head = (
    <PageHead eyebrow={<><Inbox />Workspace / Approvals</>} title="Approvals Inbox"
      description="Everything waiting on your sign-off, across vouchers, purchasing, payments, HR and credit control. Oldest and riskiest first."
      actions={<>
        <span className="tagline">clear the deck!</span>
        <div className="seg">
          <button type="button" className={cn(view === "cards" && "active")} onClick={() => setView("cards")}><LayoutGrid />Cards</button>
          <button type="button" className={cn(view === "list" && "active")} onClick={() => setView("list")}><List />List</button>
        </div>
        <Link className="btn secondary" href="/settings/approvals"><GitBranch />Approval rules</Link>
      </>} />
  );

  if (error && !inbox) return <div className="cp-screen" style={{ display: "contents" }}>{head}<ErrorState message={error} onRetry={() => void load()} /></div>;
  if (!inbox || !kpis) {
    return (
      <div className="cp-screen" style={{ display: "contents" }}>
        {head}
        <div className="kpi-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 112 }} />)}</div>
        <div className="cp-ap-grid">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 210 }} />)}</div>
      </div>
    );
  }

  const card = (it: ApprovalItem, i: number) => {
    const t = typeOf(it.entityType);
    const big = it.id === bigId;
    const f = big && feature?.id === it.id ? feature : null;
    return (
      <article key={it.id} data-id={it.id} tabIndex={0} style={{ "--i": i } as CSSProperties}
        className={cn("cp-ap-card", big && "big", sel.has(it.id) && "sel", i === focusIdx && "cp-focus")}
        onClick={(e) => { setFocus(i); if ((e.target as HTMLElement).closest(".cp-ap-ck, button, a")) return; setOpen({ id: it.id }); }}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setOpen({ id: it.id }); }}>
        <label className="cp-ap-ck" title="Select (X)"><input type="checkbox" checked={sel.has(it.id)} onChange={(e) => toggleSel(it.id, e.target.checked)} /><i><Check /></i></label>
        <div className="cp-ap-top"><span className={cn("icon-tile", t.tile)}><t.icon /></span><div><small>{t.one}</small><b>{it.docLabel}</b></div></div>
        <p className="cp-ap-title">{it.title ?? it.workflow.name}</p>
        {f && f.lines.length > 0 && (
          <div className="cp-ap-mini">{f.lines.slice(0, 3).map((l, k) => <span key={k}><em>{l.debit ? "Dr" : "Cr"} {l.account}</em><b>{rs(l.debit || -l.credit)}</b></span>)}</div>
        )}
        {f && (
          <div className="cp-ap-chain">
            <span className="done"><Avatar name={f.requestedBy.name} /><em>{f.requestedBy.name}</em><Check /></span><ChevronRight />
            {f.steps.filter((s) => s.state !== "skipped").map((s, k, arr) => {
              const you = s.state === "current" && !!me && s.approvers.some((a) => a.id === me.id);
              const name = you ? me!.name : s.actedBy[0]?.name ?? s.approvers[0]?.name ?? s.name;
              return (
                <ChainPill key={s.stepNo} last={k === arr.length - 1}>
                  <span className={s.state === "done" ? "done" : you ? "you" : "wait"}><Avatar name={name} /><em>{name}{you ? " (you)" : ""}</em>{s.state === "done" && <Check />}</span>
                </ChainPill>
              );
            })}
          </div>
        )}
        <div className="cp-ap-amtrow"><div className="cp-ap-amt">{it.amount ? rs(it.amount) : <span className="cp-nil">No amount</span>}</div><SlaChip h={slaHours(it, now)} /></div>
        <div className="cp-ap-foot">
          <Avatar name={it.requestedBy.name} /><span>{it.requestedBy.name}<small>{ageTxt(hoursSince(it.requestedAt, now))} ago</small></span><span className="spacer" />
          <button type="button" className="cp-ap-q rej" title="Reject (R)" onClick={() => setOpen({ id: it.id, mode: "reject" })}><X /></button>
          <button type="button" className="cp-ap-q ok" title="Approve (A)" disabled={busy === it.id} onClick={() => void approve(it)}><Check /></button>
        </div>
      </article>
    );
  };

  const row = (it: ApprovalItem, i: number) => {
    const t = typeOf(it.entityType);
    return (
      <tr key={it.id} data-id={it.id} className={cn(sel.has(it.id) && "selected", i === focusIdx && "cp-focus")}
        onClick={(e) => { setFocus(i); if ((e.target as HTMLElement).closest("input, button, a")) return; setOpen({ id: it.id }); }}>
        <td><input type="checkbox" checked={sel.has(it.id)} onChange={(e) => toggleSel(it.id, e.target.checked)} /></td>
        <td><div className="cell-user"><span className={cn("icon-tile sm", t.tile)}><t.icon /></span><div><b>{it.docLabel}</b><small>{t.one}</small></div></div></td>
        <td className="cp-wrap">{it.title ?? it.workflow.name}</td>
        <td><div className="cell-user"><Avatar name={it.requestedBy.name} /><span>{it.requestedBy.name}</span></div></td>
        <td className="num">{it.amount ? fmt(it.amount) : <span className="zero">—</span>}</td>
        <td>{ageTxt(hoursSince(it.requestedAt, now))}</td>
        <td><SlaChip h={slaHours(it, now)} /></td>
        <td className="actions"><div className="row cp-nowrap">
          <button type="button" className="btn ghost sm" onClick={() => setOpen({ id: it.id, mode: "reject" })}>Reject</button>
          <button type="button" className="btn primary sm" disabled={busy === it.id} onClick={() => void approve(it)}><Check />Approve</button>
        </div></td>
      </tr>
    );
  };

  const typesCount = Object.keys(counts).length;
  return (
    <div className="cp-screen" style={{ display: "contents" }}>
      {head}
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Waiting on you</span><span className="icon-well"><Inbox /></span></div><strong>{kpis.waiting}</strong><small>{kpis.breached} past SLA</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Value pending</span><span className="icon-well"><Coins /></span></div><strong>{rs(kpis.valuePending)}</strong><small>Across {typesCount} document type{typesCount === 1 ? "" : "s"}</small></div>
        <div className="kpi red"><div className="kpi-top"><span>SLA breached</span><span className="icon-well"><AlarmClock /></span></div><strong>{kpis.breached}</strong>{kpis.oldestHours === null ? <small>Nothing waiting</small> : <small className="down">Oldest {ageTxt(kpis.oldestHours)}</small>}</div>
        <div className="kpi yellow"><div className="kpi-top"><span>Approved today</span><span className="icon-well"><CircleCheck /></span></div><strong>{kpis.approvedToday}</strong><small className="up">By you since midnight</small></div>
      </div>

      <div className="toolbar cp-ap-bar">
        <div className="chips cp-chips">
          <button type="button" className={cn(activeFilter === "all" && "active")} onClick={() => { setFilter("all"); setFocus(0); }}>All<i>{items.length}</i></button>
          {Object.keys(counts).map((k) => { const t = typeOf(k); return (
            <button key={k} type="button" className={cn(activeFilter === k && "active")} onClick={() => { setFilter(k); setFocus(0); }}><t.icon />{t.label}<i>{counts[k]}</i></button>
          ); })}
        </div>
        <span className="spacer" />
        <label className="cp-ap-all">
          <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = someSel; }} onChange={(e) => visible.forEach((x) => toggleSel(x.id, e.target.checked))} /> Select all
        </label>
        <span className="cp-kbd-hint" title="Keyboard shortcuts"><kbd>J</kbd><kbd>K</kbd> move <kbd>A</kbd> approve <kbd>R</kbd> reject <kbd>X</kbd> select <kbd>↵</kbd> open</span>
      </div>

      <div ref={bodyRef}>
        {!items.length ? (
          <div className="panel cp-ap-zero">
            <div className="cp-zero-art"><PartyPopper /></div>
            <h3>Inbox zero</h3>
            <p>Nothing is waiting on you. Approvals routed to you will land here.</p>
            <div className="row cp-center">
              <Link className="btn secondary" href="/accounting/vouchers"><BookOpenCheck />Voucher register</Link>
              <Link className="btn primary" href="/dashboard"><LayoutDashboard />Back to dashboard</Link>
            </div>
          </div>
        ) : view === "cards" ? (
          <div className="cp-ap-grid">{visible.map(card)}</div>
        ) : (
          <div className="panel flush"><div className="table-wrap"><table className="tbl cp-ap-tbl" data-plain>
            <thead><tr><th /><th>Document</th><th>Details</th><th>Requested by</th><th className="num">Amount (Rs)</th><th>Age</th><th>SLA</th><th /></tr></thead>
            <tbody>{visible.map(row)}</tbody>
          </table></div></div>
        )}
      </div>

      {inbox.mine.length > 0 && (
        <Panel flush title="Requested by me" description="Documents you sent for approval: pending, and decided in the last 7 days." className="cp-ap-mine">
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Document</th><th>Details</th><th>Workflow</th><th className="num">Amount (Rs)</th><th>Requested</th><th>Status</th></tr></thead>
            <tbody>{inbox.mine.map((it) => { const t = typeOf(it.entityType); return (
              <tr key={it.id}>
                <td><div className="cell-user"><span className={cn("icon-tile sm", t.tile)}><t.icon /></span><div><Link className="link" href={it.link}><b>{it.docLabel}</b></Link><small>{t.one}</small></div></div></td>
                <td className="cp-wrap">{it.title ?? "—"}</td>
                <td>{it.workflow.name}{it.status === "PENDING" && it.currentStepNo ? <small className="muted"> · step {it.currentStepNo}</small> : null}</td>
                <td className="num">{it.amount ? fmt(it.amount) : <span className="zero">—</span>}</td>
                <td>{when(it.requestedAt)}</td>
                <td><span className={cn("badge dot", STATUS_TONE[it.status] ?? "neutral")}>{statusLabel(it.status)}</span></td>
              </tr>
            ); })}</tbody>
          </table></div>
        </Panel>
      )}

      <div className={cn("cp-ap-bulk", sel.size > 0 && "on", bulkProgress && "working")}>
        <div className="cp-ap-bulk-in">
          <b>{bulkProgress ?? `${sel.size} selected`}</b><small>Total {rs(selItems.reduce((s, x) => s + (x.amount ?? 0), 0))}</small>
          <div className="progress lime"><i style={{ width: bulkProgress ? "60%" : 0 }} /></div><span className="spacer" />
          <button type="button" className="btn ghost sm" onClick={() => setSel(new Set())}>Clear</button>
          <button type="button" className="btn danger sm" disabled={!!bulkProgress} onClick={() => setBulkRej(true)}><X />Reject</button>
          <button type="button" className="btn lime sm" disabled={!!bulkProgress} onClick={() => void bulkApprove()}><CheckCheck />Bulk approve</button>
        </div>
      </div>

      <ConfirmDialog open={bulkRej} onClose={() => setBulkRej(false)} onConfirm={() => void bulkReject()} title={`Reject ${sel.size} document${sel.size === 1 ? "" : "s"}?`}
        confirmLabel="Reject all" danger busy={!!bulkProgress}>
        Each requester gets the reason &ldquo;{BULK_REASON}&rdquo;.
      </ConfirmDialog>

      <ApprovalDrawer key={open?.id ?? "none"} target={open} item={items.find((x) => x.id === open?.id) ?? null} me={me} now={now}
        onClose={() => setOpen(null)} onDone={async (msg, tone) => { setOpen(null); toast(msg, { tone }); await load(); }} />
    </div>
  );
}

function ChainPill({ last, children }: { last: boolean; children: ReactNode }) {
  return <>{children}{!last && <ChevronRight />}</>;
}

/** The detail drawer: document lines, approval chain, comments and the decision buttons. */
function ApprovalDrawer({ target, item, me, now, onClose, onDone }: {
  target: { id: string; mode?: "reject" } | null;
  item: ApprovalItem | null;
  me: SessionUser | null;
  now: number;
  onClose: () => void;
  onDone: (msg: string, tone: "good" | "danger" | "info") => Promise<void>;
}) {
  const toast = useToast();
  const [d, setD] = useState<ApprovalDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [act, setAct] = useState<"reject" | "changes" | null>(target?.mode ?? null);
  const [reason, setReason] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [delegates, setDelegates] = useState<{ id: string; name: string }[]>([]);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!target) return;
    let live = true;
    approvalDetail(target.id).then((x) => {
      if (!live) return;
      setD(x);
      // The current step's delegates (empty when the step doesn't allow delegation).
      if (x.canAct) approvalDelegates(x.id).then((p) => live && setDelegates(p), () => live && setDelegates([]));
    }, (e) => live && setErr(errMsg(e)));
    return () => { live = false; };
  }, [target]);
  useEffect(() => { if (act) setTimeout(() => ta.current?.focus(), 50); }, [act]);

  const base = d ?? item;
  const t = typeOf(base?.entityType ?? "");
  const total = d ? d.lines.reduce((s, l) => s + l.debit, 0) : 0;

  async function decide(kind: "approve" | "reject" | "changes") {
    if (!d) return;
    if (kind !== "approve" && !reason.trim()) { setShake(true); setTimeout(() => setShake(false), 400); ta.current?.focus(); return; }
    setBusy(true);
    try {
      const r = await approvalAct(d.id, kind === "changes" ? "request-changes" : kind, { reason: kind === "approve" ? null : reason.trim(), comment: null });
      await onDone(`${d.docLabel} ${kind === "approve" ? (r.status === "APPROVED" ? "approved" : "approved, routed to the next approver") : kind === "reject" ? "rejected" : "sent back for changes"}`,
        kind === "approve" ? "good" : kind === "reject" ? "danger" : "info");
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  async function delegate(p: { id: string; name: string }) {
    if (!d) return;
    setMenu(null);
    try {
      await approvalDelegate(d.id, { userId: p.id, comment: null });
      await onDone(`${d.docLabel} delegated to ${p.name}`, "info");
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    }
  }

  async function send() {
    const v = comment.trim();
    if (!v || !d) return;
    try {
      setD(await approvalComment(d.id, v));
      setComment("");
    } catch (e) {
      toast(errMsg(e), { tone: "danger" });
    }
  }

  const thread = d ? threadOf(d) : [];
  const menuItems: MenuItem[] = delegates.slice(0, 12).map((p) => ({ label: p.name, icon: <UserPlus />, onClick: () => void delegate(p) }));
  const ageH = base ? hoursSince(base.requestedAt, now) : 0;

  return (
    <Drawer open={!!target} onClose={onClose} wide className="cp-ap-drawer" title={t.one}
      subtitle={base ? `${base.requestedBy.name} · ${ageTxt(ageH)} ago${base.amount ? ` · ${rs(base.amount)}` : ""}` : undefined}
      foot={d && d.canAct ? <>
        {delegates.length > 0 && <button type="button" className="btn ghost" onClick={(e) => setMenu(e.currentTarget)}><UserPlus />Delegate</button>}
        <button type="button" className="btn secondary" onClick={() => { setAct("changes"); setReason(""); }}><MessageSquareReply />Request changes</button>
        <span className="spacer" />
        <button type="button" className="btn danger" onClick={() => { setAct("reject"); setReason(""); }}><X />Reject</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void decide("approve")}><Check />Approve</button>
      </> : undefined}>
      {err && <ErrorState message={err} />}
      {!d && !err && <><Skeleton style={{ height: 56 }} /><Skeleton style={{ height: 220, marginTop: 14 }} /></>}
      {d && (
        <>
          <div className="cp-dr-head">
            <span className={cn("icon-tile", t.tile)}><t.icon /></span>
            <div><small>{t.one} · {d.docLabel}</small><b>{d.title ?? d.workflow.name}</b></div>
            {d.status === "PENDING" ? <SlaChip h={slaHours(d, now)} /> : <span className={cn("badge dot", STATUS_TONE[d.status] ?? "neutral")}>{statusLabel(d.status)}</span>}
          </div>
          <div className="cp-paper">
            <div className="cp-paper-h">
              <div><b>{me?.tenantName ?? d.workflow.name}</b><small>Workflow · {d.workflow.name}</small></div>
              <div className="right"><b>{d.docLabel}</b><small>Raised by {d.requestedBy.name}</small></div>
            </div>
            <table className="cp-paper-t"><tbody>
              {d.lines.map((l, i) => (
                <tr key={i}><td>{l.debit ? "Dr" : "Cr"} {l.account}{l.particulars ? <small className="muted"> · {l.particulars}</small> : null}</td><td className="num">{l.credit ? `(${fmt(l.credit)})` : fmt(l.debit)}</td></tr>
              ))}
              {(d.amount ?? total) ? <tr className="tot"><td>Amount for approval</td><td className="num">{rs(d.amount ?? total)}</td></tr> : null}
            </tbody></table>
            <div className="cp-paper-f"><span><Paperclip />No attachments</span><Link className="link" href={d.link}>Open full document <ArrowUpRight /></Link></div>
          </div>

          <h4 className="cp-h4">Approval chain</h4>
          <ol className="cp-chain">
            <li className="cp-step done" style={{ "--i": 0 } as CSSProperties}>
              <span className="cp-step-dot"><Check /></span><Avatar name={d.requestedBy.name} />
              <div><b>{d.requestedBy.name}</b><small>Requester · Submitted {when(d.requestedAt)}</small></div>
            </li>
            {d.steps.map((s, i) => {
              const you = s.state === "current" && !!me && s.approvers.some((a) => a.id === me.id);
              const cls = s.state === "done" ? "done" : you ? "you" : "wait";
              const name = s.actedBy.map((a) => a.name).join(", ") || (you ? me!.name : s.approvers.length ? s.approvers.map((a) => a.name).join(", ") : "No approver found");
              const note = s.state === "done" ? `Approved ${s.actedBy[0] ? when(s.actedBy[0].at) : ""}`
                : s.state === "skipped" ? `Skipped${s.appliesAboveAmount ? ` (only above ${rs(s.appliesAboveAmount)})` : ""}`
                  : you ? (s.mode === "ALL" ? "Waiting on you (all must approve)" : "Waiting on you")
                    : s.state === "current" ? "Waiting" : "Pending after this step";
              return (
                <li key={s.stepNo} className={cn("cp-step", cls)} style={{ "--i": i + 1 } as CSSProperties}>
                  <span className="cp-step-dot">{s.state === "done" ? <Check /> : you || s.state === "current" ? <Hourglass /> : <CircleDashed />}</span>
                  <Avatar name={name} />
                  <div><b>{name}{you && <em> (you)</em>}</b><small>{s.name} · {note}</small></div>
                </li>
              );
            })}
          </ol>

          {act && (
            <div className={cn("cp-dr-act", act === "reject" ? "rej" : "chg")}>
              <b>{act === "reject" ? "Reason for rejection" : "What needs to change?"}</b>
              <div className="cp-reasons">
                {(act === "reject" ? REJECT_REASONS : CHANGE_REASONS).map((r) => (
                  <button key={r} type="button" className={cn(reason === r && "on")} onClick={() => setReason(r)}>{r}</button>
                ))}
              </div>
              <textarea ref={ta} rows={2} className={cn(shake && "cp-shake")} placeholder={`Add a note for ${d.requestedBy.name}…`} value={reason} onChange={(e) => setReason(e.target.value)} />
              <div className="row"><span className="spacer" />
                <button type="button" className="btn ghost sm" onClick={() => setAct(null)}>Cancel</button>
                <button type="button" className={cn("btn sm", act === "reject" ? "danger solid" : "primary")} disabled={busy} onClick={() => void decide(act)}>{act === "reject" ? "Confirm reject" : "Send back"}</button>
              </div>
            </div>
          )}

          <h4 className="cp-h4">Comments <span className="badge neutral">{thread.length}</span></h4>
          <div className="cp-thread">
            {thread.length ? thread.map((c) => (
              <div key={c.id} className="cp-cm"><Avatar name={c.who} /><div><b>{c.who}</b><small>{c.tag ? `${c.tag} · ` : ""}{c.at}</small><p>{c.text}</p></div></div>
            )) : <p className="muted small cp-empty-c">No comments yet. Ask a question before approving.</p>}
          </div>
          <div className="cp-comment-in">
            <Avatar name={me?.name ?? "You"} />
            <input placeholder="Write a comment…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} />
            <button type="button" className="btn primary sm icon" title="Send" onClick={() => void send()}><Send /></button>
          </div>
          {menu && <Menu anchor={menu} items={menuItems} onClose={() => setMenu(null)} />}
        </>
      )}
    </Drawer>
  );
}
