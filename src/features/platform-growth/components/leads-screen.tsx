"use client";

import {
  ArrowRight, BadgeCheck, Briefcase, Globe, Hand, Handshake, Hourglass, Inbox, MapPin, MoreHorizontal, Pencil, Plus, Presentation, Rocket, Search,
  Tent, ThumbsUp, Trash2, UserX, Users, type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { LEAD_LOOKUPS, type Lead, type LeadBoard } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { Avatar, TenantLogo, TenantPlanPill, healthTone, rs } from "@/features/platform-tenants/components/tenant-ui";
import { ApiError } from "@/lib/api/errors";
import { deleteLead, getLeadBoard, moveLead } from "../api";
import { fmt } from "./growth-ui";
import { LeadModal } from "./lead-modal";

/** Template COLS: stage, title, icon, column tone. */
const COLS: [string, string, LucideIcon, string][] = [
  ["LEAD", "Lead", Inbox, "blue"], ["DEMO", "Demo booked", Presentation, "violet"], ["TRIAL", "Trial", Hourglass, "warn"],
  ["PAID", "Paid", BadgeCheck, "good"], ["CHURNED", "Churned", UserX, "danger"],
];
const SRC: Record<string, LucideIcon> = { WEBSITE: Globe, REFERRAL: Users, PARTNER: Handshake, FACEBOOK: ThumbsUp, LINKEDIN: Briefcase, EXPO: Tent };
const daysLeft = (d: string | null) => (d ? Math.ceil((Date.parse(`${d}T23:59:59`) - Date.now()) / 86_400_000) : null);

/**
 * Template admin/leads (9B-admin-plus.js 1469–1618): pipeline stats, owner filter, a drag-and-drop kanban
 * (Lead → Demo → Trial → Paid / Churned) with arrow-key and menu fallbacks, and the New lead modal. Moving to Paid
 * offers "Onboard": the Phase 40 wizard, pre-filled from the lead, which links the new company to it.
 */
export function LeadsScreen() {
  const router = useRouter();
  const toast = useToast();
  const lookups = useAdminLookups(LEAD_LOOKUPS);
  const [board, setBoard] = useState<LeadBoard | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [modal, setModal] = useState<{ id: string | null } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; lead: Lead } | null>(null);
  const [churn, setChurn] = useState<{ lead: Lead; beforeId: string | null } | null>(null);
  const [del, setDel] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; beforeId: string | null } | null>(null);
  const drag = useRef<string | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    getLeadBoard()
      .then((b) => { if (!cancelled) { setBoard(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the leads" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  const head = (
    <div className="page-head">
      <div><div className="eyebrow">Growth / Leads CRM</div><h1>Leads CRM</h1><p>Drag deals from lead to demo, trial and paid. Values are monthly recurring revenue in PKR.</p></div>
      <div className="head-actions">
        <span className="tagline">Close the gap to Rs 5M</span>
        <button type="button" className="btn primary" onClick={() => setModal({ id: null })}><Plus />New lead</button>
      </div>
    </div>
  );
  if (error) return <>{head}<ErrorState {...error} onRetry={reload} /></>;
  if (!board) return <>{head}<Skeleton style={{ height: 120, borderRadius: 18 }} /><Skeleton style={{ height: 420, borderRadius: 18, marginTop: 16 }} /></>;

  const leads = board.items;
  const visible = (l: Lead) => (!q || `${l.companyName} ${l.city ?? ""}`.toLowerCase().includes(q.toLowerCase())) && (!owner || l.ownerStaffId === owner);
  const inCol = (k: string) => leads.filter((l) => l.stage === k).sort((a, b) => a.boardPosition - b.boardPosition);
  const value = (k: string) => inCol(k).reduce((s, l) => s + l.expectedMrr, 0);
  const st = (k: string) => board.pipeline.stages.find((s) => s.stage === k);
  const open = inCol("LEAD").length + inCol("DEMO").length + inCol("TRIAL").length;
  const steps: [string, string][] = [["Leads", "LEAD"], ["Demos", "DEMO"], ["Trials", "TRIAL"], ["Paid", "PAID"]];

  const move = async (lead: Lead, stage: string, beforeId: string | null, lostReason?: string) => {
    if (lead.stage === stage && !beforeId && inCol(stage).at(-1)?.id === lead.id) return;
    // optimistic: the card lands at once, the server's order follows
    setBoard((b) => b && { ...b, items: b.items.map((l) => (l.id === lead.id ? { ...l, stage } : l)) });
    try {
      const saved = await moveLead(lead.id, { stage, beforeId, lostReason, rowVersion: lead.rowVersion });
      setFlash(saved.id);
      const name = COLS.find((c) => c[0] === stage)![1];
      if (stage !== lead.stage) {
        if (stage === "PAID") {
          toast(`${lead.companyName} is now a paying tenant · +${rs(lead.expectedMrr)} MRR`, {
            tone: "good", ms: 8000, action: saved.tenantId ? undefined : { label: "Onboard", onClick: () => router.push(`/admin/leads/${lead.id}/convert`) },
          });
        } else if (stage === "CHURNED") toast(`${lead.companyName} marked churned`, { tone: "warn" });
        else toast(`${lead.companyName} moved to ${name}`, { tone: "info" });
      }
    } catch (e) {
      toast(adminErrorMessage(e, "Could not move the lead"), { tone: "danger" });
    }
    reload();
  };
  const request = (lead: Lead, stage: string, beforeId: string | null) => {
    if (stage === "CHURNED" && lead.stage !== "CHURNED") setChurn({ lead, beforeId });
    else void move(lead, stage, beforeId);
  };

  // ---- HTML5 drag & drop (template: placeholder before the card under the pointer)
  const onDragOver = (e: DragEvent<HTMLDivElement>, col: string) => {
    if (!drag.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const cards = [...e.currentTarget.querySelectorAll<HTMLElement>(".ap-lcard:not(.ap-dragging)")];
    const after = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    const beforeId = after?.dataset.id ?? null;
    if (over?.col !== col || over.beforeId !== beforeId) setOver({ col, beforeId });
  };
  const onDrop = (e: DragEvent<HTMLDivElement>, col: string) => {
    e.preventDefault();
    const id = drag.current;
    drag.current = null;
    const beforeId = over?.col === col ? over.beforeId : null;
    setOver(null);
    const lead = leads.find((l) => l.id === id);
    if (lead) request(lead, col, beforeId === lead.id ? null : beforeId);
  };

  const menuItems = (l: Lead): MenuItem[] => [
    { label: "Open lead", icon: <Pencil />, onClick: () => setModal({ id: l.id }) },
    ...COLS.filter(([k]) => k !== l.stage).map(([k, label, Icon]): MenuItem => ({ label: `Move to ${label}`, icon: <Icon />, disabled: !!l.tenantId && k !== "CHURNED", onClick: () => request(l, k, null) })),
    ...(l.tenantId ? [] : [{ label: "Onboard as company", icon: <Rocket />, onClick: () => router.push(`/admin/leads/${l.id}/convert`) } as MenuItem]),
    { sep: true },
    { label: "Delete lead", icon: <Trash2 />, danger: true, onClick: () => setDel(l) },
  ];

  const card = (l: Lead) => {
    const left = daysLeft(l.trialEndsOn);
    const SrcIcon = SRC[l.source] ?? Globe;
    const note = l.tenantName ? `Onboarded as ${l.tenantName}` : l.stage === "PAID" && l.wonAt ? `Won ${new Date(l.wonAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
      : l.stage === "CHURNED" && l.lostReason ? `Reason: ${l.lostReason}` : l.stage === "DEMO" && l.demoAt
        ? `Demo ${new Date(l.demoAt).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : l.notes;
    return (
      <article key={l.id} data-id={l.id} className={cn("kb-card ap-lcard", flash === l.id && "ap-landed")} draggable tabIndex={0} aria-label={l.companyName}
        onDragStart={(e) => { drag.current = l.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", l.id); } catch { /* ignore */ } requestAnimationFrame(() => (e.target as HTMLElement).classList.add("ap-dragging")); }}
        onDragEnd={(e) => { (e.target as HTMLElement).classList.remove("ap-dragging"); drag.current = null; setOver(null); }}
        onDoubleClick={() => setModal({ id: l.id })}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setModal({ id: l.id }); return; }
          if (!/Arrow(Left|Right)/.test(e.key)) return;
          const i = COLS.findIndex((c) => c[0] === l.stage) + (e.key === "ArrowRight" ? 1 : -1);
          if (i >= 0 && i < COLS.length) request(l, COLS[i]![0], null);
        }}>
        <div className="ap-lc-top"><TenantLogo name={l.companyName} size="xs" /><b>{l.companyName}</b>
          <button type="button" className="icon-btn-sm" aria-label="Lead actions" onClick={(e) => { e.stopPropagation(); setMenu({ anchor: e.currentTarget, lead: l }); }}><MoreHorizontal /></button></div>
        <div className="ap-lc-meta">{l.city && <span><MapPin />{l.city}</span>}<span className="ap-src"><SrcIcon />{labelOf(lookups, "PlatformLeadSource", l.source)}</span></div>
        {l.stage === "TRIAL" && l.trialEngagementScore !== null ? (
          <div className={cn("ap-eng", healthTone(l.trialEngagementScore))}>
            <div className="row"><small>Trial engagement</small><span className="spacer" /><b>{l.trialEngagementScore}</b></div>
            <div className={cn("ap-bar thin", healthTone(l.trialEngagementScore))}><i style={{ ["--w" as string]: `${l.trialEngagementScore}%` }} /></div>
            {left !== null && <small>{left > 0 ? `${left} day${left > 1 ? "s" : ""} left` : "Trial ended"}</small>}
          </div>
        ) : l.stage === "TRIAL" && left !== null ? <small className="ap-lc-note">{left > 0 ? `Trial · ${left} day${left > 1 ? "s" : ""} left` : "Trial ended"}</small>
          : note ? <small className="ap-lc-note">{note}</small> : null}
        <div className="ap-lc-foot"><Avatar name={l.ownerName} size="xs" /><span>{l.ownerName.split(" ")[0]}</span><span className="spacer" />
          {l.planCode && <TenantPlanPill code={l.planCode} name={l.planName} />}<b>{fmt(l.expectedMrr)}</b></div>
      </article>
    );
  };

  return (
    <>
      {head}
      <div className="ap-lstats">
        <div className="ap-ls"><small>Pipeline value</small><b>{rs(board.pipeline.pipelineValue)}<em>/mo</em></b><span>{open} open deal{open === 1 ? "" : "s"}</span></div>
        {steps.map(([label, k], i) => (
          <div key={k} className="ap-ls step"><small>{label}</small><b>{k === "PAID" ? inCol("PAID").length : st(k)?.reached ?? 0}</b>
            {i ? <span className="ap-conv"><ArrowRight />{st(k)?.stepConversionPct ?? 0}%</span> : <span>All time</span>}</div>
        ))}
        <div className="ap-ls win"><small>Win rate</small><b>{Math.round(board.pipeline.winRatePct ?? 0)}%</b><span>{rs(value("PAID"))} won MRR</span></div>
      </div>

      <div className="toolbar">
        <label className={cn("search-field", q && "has-val")} style={{ minWidth: 180 }}><Search /><input value={q} placeholder="Search company or city…" onChange={(e) => setQ(e.target.value)} /></label>
        <div className={cn("ap-owners", owner && "filtering")}>
          {board.staff.map((s) => <button key={s.id} type="button" className={owner === s.id ? "on" : undefined} title={s.name} onClick={() => setOwner((o) => (o === s.id ? "" : s.id))}><Avatar name={s.name} size="sm" /></button>)}
        </div>
        <span className="spacer" /><span className="ap-hint"><Hand />Drag cards between columns</span>
      </div>

      <div className="kanban ap-kb">
        {COLS.map(([k, label, , tone]) => {
          const list = inCol(k).filter(visible);
          return (
            <div key={k} className={cn("kb-col", `ap-col-${tone}`, over?.col === k && "ap-over")} onDragOver={(e) => onDragOver(e, k)} onDrop={(e) => onDrop(e, k)}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o?.col === k ? null : o)); }}>
              <div className="kb-col-head"><h4><i className="ap-cdot" />{label}</h4><span>{inCol(k).length}</span></div>
              <small className="ap-colval">{rs(value(k))} <em>/ mo</em></small>
              <div className="ap-kb-list">
                {list.map((l) => (
                  <div key={l.id} style={{ display: "contents" }}>
                    {over?.col === k && over.beforeId === l.id && <div className="ap-ph" />}
                    {card(l)}
                  </div>
                ))}
                {over?.col === k && !over.beforeId && <div className="ap-ph" />}
                {!list.length && over?.col !== k && <div className="ap-kb-empty"><Inbox />Drop here</div>}
              </div>
            </div>
          );
        })}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menuItems(menu.lead)} onClose={() => setMenu(null)} />}
      {modal && <LeadModal id={modal.id} staff={board.staff} lookups={lookups} onClose={() => setModal(null)} onSaved={(id) => { setFlash(id); reload(); }} />}
      <ChurnDialog lead={churn?.lead ?? null} onClose={() => setChurn(null)} onConfirm={(reason) => { const c = churn!; setChurn(null); void move(c.lead, "CHURNED", c.beforeId, reason); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.companyName ?? "lead"}?`} confirmLabel="Delete lead" danger busy={busy}
        onConfirm={async () => {
          if (!del) return;
          setBusy(true);
          try { await deleteLead(del.id, del.rowVersion); toast(`${del.companyName} deleted`, { tone: "danger" }); setDel(null); reload(); }
          catch (e) { toast(adminErrorMessage(e, "Could not delete the lead"), { tone: "danger" }); }
          finally { setBusy(false); }
        }}>The lead leaves the board. Its history and activities are kept.</ConfirmDialog>
    </>
  );
}

/** Churned: why the deal was lost (template note "Reason: price"). */
function ChurnDialog({ lead, onClose, onConfirm }: { lead: Lead | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [for_, setFor] = useState<string | null>(null);
  if ((lead?.id ?? null) !== for_) { setFor(lead?.id ?? null); setReason(""); }
  return (
    <Modal open={!!lead} onClose={onClose} title={`Mark ${lead?.companyName ?? ""} churned`} subtitle="Why was the deal lost?"
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" onClick={() => onConfirm(reason.trim())}><UserX />Mark churned</button></>}>
      <div className="form-grid">
        <label className="full"><span>Reason</span>
          <select value={["", "Price", "Went with competitor", "No budget", "Not ready", "No response"].includes(reason) ? reason : "other"} onChange={(e) => setReason(e.target.value === "other" ? "" : e.target.value)}>
            <option value="">Choose…</option>{["Price", "Went with competitor", "No budget", "Not ready", "No response"].map((r) => <option key={r}>{r}</option>)}<option value="other">Other…</option>
          </select>
        </label>
        <label className="full"><span>Details</span><input value={reason} maxLength={200} placeholder="e.g. went with Tally" onChange={(e) => setReason(e.target.value)} /></label>
      </div>
    </Modal>
  );
}
