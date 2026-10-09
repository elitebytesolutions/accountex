"use client";

import "./my-expense-claims-screen.css";
import {
  ArrowRight, Banknote, BedDouble, BookOpen, Bus, Camera, Check, CircleCheck, CircleParking, Fuel, Hourglass, Info, Keyboard, Loader, Minus, PenLine, Plus,
  Receipt, ScanLine, Send, Smartphone, Trash2, TriangleAlert, UploadCloud, Utensils, X, type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { claimPolicyCheck, type ExpenseClaim, type ExpenseClaimList, type MyClaimOptions } from "@/shared";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { Money } from "@/features/finance/components/finance-ui";
import { createMyClaim, deleteMyClaim, myClaim, myClaimAction, myClaimOptions, myClaims, updateMyClaim } from "../api";

type Item = ExpenseClaimList["items"][number];
type Opts = MyClaimOptions;
type Cat = Opts["categories"][number];

const LATER = "Receipt scanning arrives with document storage";
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;
const fmtDay = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const today = () => new Date().toISOString().slice(0, 10);
const PER: Record<string, string> = { PER_CLAIM: "per claim", PER_TRIP: "per trip", PER_DAY: "per day", PER_NIGHT: "per night", PER_MEAL: "per meal", PER_MONTH: "a month" };
const REASONS: Record<string, string> = { MISSING_RECEIPT: "Receipt missing", EXCEEDS_POLICY: "Exceeds policy", NOT_BUSINESS: "Not a business expense", DUPLICATE: "Duplicate claim", WRONG_COST_CENTRE: "Wrong cost centre", OTHER: "Other" };
const ACTIONS: Record<string, string> = { SUBMITTED: "Submitted", RESUBMITTED: "Resubmitted", MANAGER_APPROVED: "Approved by the line manager", APPROVED: "Approved by Finance", APPROVED_WITH_EXCEPTION: "Approved by Finance (policy exception)", REJECTED: "Rejected", WITHDRAWN: "Withdrawn", PAID: "Reimbursed", COMMENTED: "Comment" };

/** Our statuses in the template's words (Pending / Approved / Reimbursed / Rejected) plus Draft and Withdrawn. */
const label = (s: string) => ({ DRAFT: "Draft", PENDING: "Pending", OVER_POLICY: "Pending", APPROVED: "Approved", PAID: "Reimbursed", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" })[s] ?? s;
const TONE: Record<string, string> = { Pending: "warn", Approved: "good", Reimbursed: "good", Rejected: "danger", Draft: "neutral", Withdrawn: "neutral" };
const Badge = ({ s }: { s: string }) => <span className={`badge dot ${TONE[label(s)] ?? "neutral"}`}>{label(s)}</span>;
/** The template's chips; drafts and withdrawn claims show under All. */
const CHIPS = ["All", "Pending", "Approved", "Reimbursed", "Rejected"];

/** Category icons by the master's icon name (lucide names), then by its code / name; tones rotate like the template. */
const ICONS: Record<string, LucideIcon> = { fuel: Fuel, utensils: Utensils, bus: Bus, "bed-double": BedDouble, smartphone: Smartphone, "circle-parking": CircleParking, "pen-line": PenLine, receipt: Receipt };
const TONES = ["green", "orange", "blue", "violet", "lime"];
function catIcon(c: { id: string; code?: string; name: string; icon: string | null }, all: { id: string }[]) {
  const key = (c.icon ?? "").toLowerCase();
  const byName = /fuel|petrol/i.test(c.name) ? Fuel : /meal|food|lunch|dinner/i.test(c.name) ? Utensils : /travel|bus|flight|train/i.test(c.name) ? Bus : /lodg|hotel/i.test(c.name) ? BedDouble : /mobile|phone/i.test(c.name) ? Smartphone : /park|toll/i.test(c.name) ? CircleParking : /station/i.test(c.name) ? PenLine : Receipt;
  const i = Math.max(0, all.findIndex((x) => x.id === c.id));
  return { Icon: ICONS[key] ?? byName, tone: TONES[i % TONES.length]! };
}

/** Sent → Manager → Finance → Paid, from the claim's status and workflow stage (template ES.tracker). */
function Tracker({ c, subs, small }: { c: Pick<Item, "status" | "workflowStage">; subs?: (string | null)[]; small?: boolean }) {
  const STEPS = ["Sent", "Manager", "Finance", "Paid"];
  const stageAt = c.workflowStage === "FINANCE" ? 2 : 1;
  const at = c.status === "DRAFT" ? -1 : c.status === "PAID" ? 4 : c.status === "APPROVED" ? 3 : stageAt;
  const state = c.status === "REJECTED" ? "rej" : c.status === "WITHDRAWN" ? "cancel" : "ok";
  return (
    <ol className={`es-track${small ? " sm" : ""}`}>
      {STEPS.map((s, i) => {
        const cls = i < at ? "done" : i === at ? (state === "rej" ? "rej" : state === "cancel" ? "cancel" : "now") : "";
        const Ic = cls === "done" ? Check : cls === "rej" ? X : cls === "cancel" ? Minus : cls === "now" ? Loader : null;
        return (
          <li key={s} className={cls} style={{ ["--i" as string]: i }}>
            <span className="es-track-dot">{Ic && <Ic />}</span>
            <b>{s}</b>
            {subs?.[i] && <small>{subs[i]}</small>}
          </li>
        );
      })}
    </ol>
  );
}

type Line = { id?: string; description: string; expenseDate: string; amount: string };
type Draft = { id: string | null; rowVersion: number; title: string; merchant: string; categoryId: string; costCentreId: string; travelRequestRef: string; receiptCount: string; policyJustification: string; lines: Line[] };
const emptyDraft = (cat?: string): Draft => ({ id: null, rowVersion: 0, title: "", merchant: "", categoryId: cat ?? "", costCentreId: "", travelRequestRef: "", receiptCount: "0", policyJustification: "", lines: [{ description: "", expenseDate: today(), amount: "" }] });
const draftOf = (c: ExpenseClaim): Draft => ({
  id: c.id, rowVersion: c.rowVersion, title: c.title, merchant: c.merchant ?? "", categoryId: c.category.id, costCentreId: c.costCentre?.id ?? "", travelRequestRef: c.travelRequestRef ?? "",
  receiptCount: String(c.receiptCount), policyJustification: c.policyJustification ?? "",
  lines: c.lines.map((l) => ({ id: l.id, description: l.description, expenseDate: l.expenseDate ?? today(), amount: String(l.amount) })),
});

/** My Profile › Expense Claims (template app/profile/expenses, 9C-ess.js): KPIs, my claims with the step tracker, the new-claim sheet, policy limits. */
export function MyExpenseClaimsScreen({ can }: { can: { create: boolean; edit: boolean } }) {
  const toast = useToast();
  const [list, setList] = useState<ExpenseClaimList | null>(null);
  const [opts, setOpts] = useState<Opts | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; status?: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState<ExpenseClaim | null>(null);
  const [sheet, setSheet] = useState<{ draft: Draft; phase: "capture" | "form" } | null>(null);
  const [policy, setPolicy] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([myClaims({ pageSize: 500 }), myClaimOptions()])
      .then(([l, o]) => { if (!cancelled) { setList(l); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, status: e.status } : { message: "Could not load your claims" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const items = useMemo(() => list?.items ?? [], [list]);
  const shown = items.filter((c) => filter === "All" || label(c.status) === filter);
  const count = (f: string) => items.filter((c) => f === "All" || label(c.status) === f).length;
  const cats = opts?.categories ?? [];

  // KPIs: pending, approved this month (awaiting payment), reimbursed this fiscal year (from July), a limited category's use this month
  const monthKey = today().slice(0, 7);
  const fyStart = (() => { const d = new Date(); const y = d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; return `${y}-07-01`; })();
  const pending = items.filter((c) => label(c.status) === "Pending");
  const approved = items.filter((c) => c.status === "APPROVED" && (c.approvedAt ?? "").slice(0, 7) === monthKey);
  const paidFy = items.filter((c) => c.status === "PAID" && (c.paidAt ?? "") >= fyStart);
  const sum = (xs: Item[], approvedAmt = false) => xs.reduce((s, c) => s + (approvedAmt ? (c.approvedAmount ?? c.totalAmount) : c.totalAmount), 0);
  const watched = [...cats].filter((c) => c.limitAmount && c.limitPeriod === "PER_MONTH").sort((a, b) => b.usedThisMonth / b.limitAmount! - a.usedThisMonth / a.limitAmount!)[0];

  const openClaim = async (id: string) => {
    try { setOpen(await myClaim(id)); } catch (e) { toast(e instanceof ApiError ? e.message : "Could not open the claim", { tone: "danger" }); }
  };
  const act = async (c: ExpenseClaim, a: "withdraw" | "resubmit") => {
    setBusy(a);
    try {
      const r = await myClaimAction(c.id, a, c.rowVersion);
      if (a === "resubmit") { setOpen(null); setSheet({ draft: draftOf(r), phase: "form" }); toast(`${r.docNo} opened as a new draft`, { tone: "info" }); }
      else { setOpen(r); toast(`${c.docNo} withdrawn`, { tone: "info" }); }
      reload();
    } catch (e) { toast(e instanceof ApiError ? e.message : "That didn’t work", { tone: "danger" }); }
    setBusy(null);
  };
  const remove = async (c: ExpenseClaim) => {
    setBusy("delete");
    try { await deleteMyClaim(c.id, c.rowVersion); setOpen(null); toast(`${c.docNo} deleted`, { tone: "info" }); reload(); }
    catch (e) { toast(e instanceof ApiError ? e.message : "Could not delete the draft", { tone: "danger" }); }
    setBusy(null);
  };

  const notLinked = error?.status === 403;
  const head = (
    <PageHead eyebrow="My Money / Expenses" title="Expense Claims"
      description="Record what you spent and send it for approval. Approved claims are reimbursed in cash or by bank transfer."
      actions={<>
        <button className="btn secondary" type="button" onClick={() => setPolicy(true)} disabled={!opts}><BookOpen />Policy limits</button>
        {can.create && <button className="btn primary" type="button" onClick={() => setSheet({ draft: emptyDraft(), phase: "capture" })} disabled={!opts}><ScanLine />New claim</button>}
      </>} />
  );

  if (notLinked) return (<>{head}<div className="es-card"><div className="es-empty"><span className="icon-tile lime"><Receipt /></span><b>Your user isn’t linked to an employee record</b><span>Expense claims are filed by employees. Ask HR to link your user to your employee profile.</span></div></div></>);

  return (
    <>
      {head}
      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : (
        <>
          <div className="es-grid es-g4 es-keep2 es-ex-kpis">
            {!list ? [0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 128 }} />) : <>
              <div className="es-card es-ex-kpi"><div className="es-row"><span className="es-label">Pending</span><span className="spacer" style={{ flex: 1 }} /><span className="icon-tile orange"><Hourglass /></span></div><b className="num-big">{rs(sum(pending))}</b><small>{pending.length} claim{pending.length === 1 ? "" : "s"} awaiting approval</small></div>
              <div className="es-card es-ex-kpi"><div className="es-row"><span className="es-label">Approved this month</span><span className="spacer" style={{ flex: 1 }} /><span className="icon-tile green"><CircleCheck /></span></div><b className="num-big">{rs(sum(approved, true))}</b><small>Reimbursed in cash or by bank transfer</small></div>
              <div className="es-card es-ex-kpi"><div className="es-row"><span className="es-label">Reimbursed · FY</span><span className="spacer" style={{ flex: 1 }} /><span className="icon-tile blue"><Banknote /></span></div><b className="num-big">{rs(sum(paidFy, true))}</b><small>{paidFy.length} claim{paidFy.length === 1 ? "" : "s"} since {fmtDay(fyStart).slice(3)}</small></div>
              {watched ? (() => {
                const p = Math.min(100, (watched.usedThisMonth / watched.limitAmount!) * 100);
                const { Icon } = catIcon(watched, cats);
                return <div className="es-card es-ex-kpi"><div className="es-row"><span className="es-label">{watched.name} used · {new Date().toLocaleDateString("en-GB", { month: "short" })}</span><span className="spacer" style={{ flex: 1 }} /><span className="icon-tile lime"><Icon /></span></div><b className="num-big">{rs(watched.usedThisMonth)}</b><div className={`progress${p >= 100 ? " danger" : p > 85 ? " warn" : ""}`}><i style={{ width: `${p}%` }} /></div><small>of {rs(watched.limitAmount!)} monthly limit</small></div>;
              })() : <div className="es-card es-ex-kpi"><div className="es-row"><span className="es-label">Drafts</span><span className="spacer" style={{ flex: 1 }} /><span className="icon-tile lime"><PenLine /></span></div><b className="num-big">{count("Draft")}</b><small>Not sent yet</small></div>}
            </>}
          </div>

          <div className="es-grid es-main">
            <div className="es-card flush">
              <div className="es-head"><h3>My claims</h3><span className="spacer" />
                <div className="chips es-ex-chips">{CHIPS.slice(0, 5).map((f) => <button key={f} type="button" className={filter === f ? "active" : undefined} onClick={() => setFilter(f)}>{f} <i>{count(f)}</i></button>)}</div>
              </div>
              <div className="es-ex-list">
                {!list ? [0, 1, 2].map((i) => <Skeleton key={i} style={{ height: 60, margin: 8 }} />) : shown.length ? shown.map((c, i) => {
                  const { Icon, tone } = catIcon(c.category, cats);
                  return (
                    <div key={c.id} className="es-ex-row es-in" style={{ ["--i" as string]: i }} tabIndex={0} role="button" onClick={() => openClaim(c.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); void openClaim(c.id); } }}>
                      <span className={`icon-tile ${tone}`}><Icon /></span>
                      <div className="es-ex-m"><b>{c.merchant ? `${c.merchant} · ${c.title}` : c.title}</b><small>{c.docNo} · {fmtDay(c.submittedAt ?? c.docDate)} · {c.category.name}</small></div>
                      <span className="es-ex-cc">{c.costCentre?.name ?? "—"}</span>
                      <div className="es-ex-trk"><Tracker c={c} /></div>
                      <div className="es-ex-amt"><b><Money value={c.totalAmount} /></b><Badge s={c.status} /></div>
                    </div>
                  );
                }) : <div className="es-empty"><span className="icon-tile lime"><Receipt /></span><b>{filter === "All" ? "No claims yet" : `No ${filter.toLowerCase()} claims`}</b><span>{can.create ? "Start a new claim for what you spent on company business." : "Your claims show here."}</span></div>}
              </div>
            </div>
            <div className="es-col">
              <div className="es-card es-ex-quick">
                <div className="es-head"><h3>Quick capture</h3><span className="spacer" /><span className="pill">Manual entry</span></div>
                <div className="es-ex-qdrop" aria-disabled="true" title={LATER}><span className="es-ex-dzic"><UploadCloud /></span><b>Drop or upload a receipt</b><small>{LATER} · keep the paper receipt and note how many you hold</small></div>
                {can.create && <button type="button" className="btn primary" onClick={() => setSheet({ draft: emptyDraft(), phase: "form" })} disabled={!opts}><Keyboard />Enter a claim</button>}
              </div>
              <div className="es-card">
                <div className="es-head"><h3>Policy limits</h3><span className="spacer" /><button type="button" className="es-link" onClick={() => setPolicy(true)} disabled={!opts}>Full policy<ArrowRight /></button></div>
                <div className="es-ex-lims">
                  {!opts ? <Skeleton style={{ height: 120 }} /> : cats.filter((c) => c.limitAmount).slice(0, 5).map((c, i) => {
                    const { Icon, tone } = catIcon(c, cats);
                    const monthly = c.limitPeriod === "PER_MONTH";
                    const p = monthly ? Math.min(100, (c.usedThisMonth / c.limitAmount!) * 100) : 0;
                    return (
                      <div key={c.id} className="es-ex-lim" style={{ ["--i" as string]: i }}>
                        <span className={`icon-tile ${tone}`}><Icon /></span>
                        <div>
                          <div className="es-row"><b>{c.name}</b><span className="spacer" style={{ flex: 1 }} /><small>{monthly ? `${rs(c.usedThisMonth)} / ` : "Max "}{rs(c.limitAmount!)} {PER[c.limitPeriod ?? ""] ?? ""}</small></div>
                          {monthly ? <div className={`progress${p >= 100 ? " danger" : p > 85 ? " warn" : ""}`}><i style={{ width: `${p}%` }} /></div> : <small className="es-muted">{c.requiresPreApproval ? "Needs pre-approval" : "Above this needs a justification"}</small>}
                        </div>
                      </div>
                    );
                  })}
                  {opts && !cats.some((c) => c.limitAmount) && <small className="es-label">No category has a limit.</small>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {sheet && opts && <ClaimSheet key={sheet.draft.id ?? "new"} initial={sheet} opts={opts} onClose={() => setSheet(null)} onSaved={(c, submitted) => { setSheet(null); reload(); setFilter("All"); toast(submitted ? `${c.docNo} submitted · ${rs(c.totalAmount)} sent for approval` : `${c.docNo} saved as a draft`, { tone: submitted ? "good" : "info" }); }} />}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.docNo ?? ""} subtitle={open ? `${open.category.name} · ${fmtDay(open.submittedAt ?? open.docDate)}` : undefined} className="es-sheet-host"
        foot={open && <>
          <button className="btn secondary" type="button" onClick={() => setOpen(null)}>Close</button>
          {open.status === "DRAFT" && !open.submittedAt && can.edit && <button className="btn danger" type="button" disabled={!!busy} onClick={() => remove(open)}><Trash2 />Delete</button>}
          {open.status === "DRAFT" && can.edit && <button className="btn primary" type="button" onClick={() => { setSheet({ draft: draftOf(open), phase: "form" }); setOpen(null); }}><PenLine />Edit</button>}
          {label(open.status) === "Pending" && can.edit && <button className="btn danger" type="button" disabled={!!busy} onClick={() => act(open, "withdraw")}>Withdraw</button>}
          {open.status === "REJECTED" && open.allowResubmit && can.create && <button className="btn primary" type="button" disabled={!!busy} onClick={() => act(open, "resubmit")}>Resubmit</button>}
        </>}>
        {open && (() => {
          const { Icon, tone } = catIcon(open.category, cats);
          const by = (a: string) => open.actions.filter((x) => x.action === a).at(-1)?.actor?.name ?? null;
          const paid = open.actions.filter((x) => x.action === "PAID").at(-1);
          return (
            <>
              <div className="es-ex-dhero"><span className={`icon-tile ${tone}`}><Icon /></span><div><b>{open.merchant ? `${open.merchant} · ${open.title}` : open.title}</b><span>{rs(open.totalAmount)}</span></div><Badge s={open.status} /></div>
              <Tracker c={open} subs={["You", by("MANAGER_APPROVED") ?? (open.workflowStage === "FINANCE" && !by("MANAGER_APPROVED") && open.status !== "DRAFT" ? "Skipped" : "Line manager"), by("APPROVED") ?? by("APPROVED_WITH_EXCEPTION") ?? "Finance", paid ? fmtDay(paid.actedAt) : null]} />
              {open.status === "REJECTED" && <div style={{ marginTop: 16 }}><Banner tone="danger" title={`Rejected${by("REJECTED") ? ` by ${by("REJECTED")}` : ""} · ${REASONS[open.rejectionReason ?? ""] ?? "Other"}`}>{open.rejectionComment ?? (open.allowResubmit ? "You can resubmit it as a new claim." : "This claim can’t be resubmitted.")}</Banner></div>}
              {open.isOverPolicy && open.status !== "REJECTED" && <div style={{ marginTop: 16 }}><Banner tone="warn" title="Over the policy limit">{open.policyJustification ?? ""}</Banner></div>}
              <div className="dl" style={{ marginTop: 16 }}>
                <div><span>Cost centre</span><b>{open.costCentre?.name ?? "—"}</b></div>
                <div><span>Purpose</span><b>{open.title}</b></div>
                <div><span>Payment</span><b>{open.status === "PAID" ? (open.paymentMethod === "CASH" ? "Paid in cash" : "Paid by bank transfer") : "Cash or bank transfer once approved"}</b></div>
                <div><span>Receipts held</span><b>{open.receiptCount ? `${open.receiptCount} paper receipt${open.receiptCount === 1 ? "" : "s"}` : "None"}</b></div>
                {open.travelRequestRef && <div><span>Travel request</span><b>{open.travelRequestRef}</b></div>}
                {open.resubmittedFrom && <div><span>Resubmits</span><b>{open.resubmittedFrom.docNo}</b></div>}
              </div>
              <table className="es-ex-lines"><tbody>
                {open.lines.map((l) => <tr key={l.id}><td>{l.description}<small>{fmtDay(l.expenseDate)}{l.merchant ? ` · ${l.merchant}` : ""}</small></td><td>{rs(l.amount)}</td></tr>)}
                <tr><td><b>Total</b></td><td>{rs(open.totalAmount)}</td></tr>
              </tbody></table>
              {open.actions.length > 0 && <ul className="es-ex-acts">{open.actions.map((a) => <li key={a.id}><div><b>{ACTIONS[a.action] ?? a.action}</b>{a.comment ? ` · ${REASONS[a.comment] ?? a.comment}` : ""}<small>{a.actor?.name ?? (a.action === "REJECTED" || a.action === "COMMENTED" ? "Approver" : "System")} · {new Date(a.actedAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div></li>)}</ul>}
            </>
          );
        })()}
      </Drawer>

      <Modal open={policy} onClose={() => setPolicy(false)} title="Travel & expense policy" subtitle="Limits per category, set by Finance" foot={<button className="btn primary" type="button" onClick={() => setPolicy(false)}>Got it</button>}>
        <ul className="es-tx-notes">
          {cats.map((c) => { const { Icon } = catIcon(c, cats); return <li key={c.id}><Icon /><span><b>{c.name}</b> · {c.limitAmount ? `up to ${rs(c.limitAmount)} ${PER[c.limitPeriod ?? ""] ?? ""}` : "no limit"}{c.requiresPreApproval ? "; needs pre-approval (quote the travel request)" : ""}{c.receiptRequired ? "; receipt required" : ""}.</span></li>; })}
          <li><Info /><span>Over a limit, add a justification; your line manager and Finance decide.</span></li>
        </ul>
      </Modal>
    </>
  );
}

/** The new / edit claim sheet: capture (scan and camera arrive with document storage) then the form with a live policy check. */
function ClaimSheet({ initial, opts, onClose, onSaved }: { initial: { draft: Draft; phase: "capture" | "form" }; opts: Opts; onClose: () => void; onSaved: (c: ExpenseClaim, submitted: boolean) => void }) {
  const [phase, setPhase] = useState(initial.phase);
  const [d, setD] = useState<Draft>(initial.draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setLine = (i: number, patch: Partial<Line>) => setD((x) => ({ ...x, lines: x.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const cat: Cat | undefined = opts.categories.find((c) => c.id === d.categoryId);
  const total = Math.round(d.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
  const pol = cat && total > 0 ? claimPolicyCheck(cat.limitAmount, cat.limitPeriod, total, cat.usedThisMonth) : null;
  const near = pol && !pol.isOver && pol.message.startsWith("Near");
  const ready = !!d.title.trim() && !!d.categoryId && total > 0 && d.lines.every((l) => l.description.trim() && Number(l.amount) > 0);

  const save = async (submit: boolean) => {
    setBusy(submit ? "submit" : "draft"); setErrors({}); setFailure(null);
    const body = {
      title: d.title, merchant: d.merchant || null, categoryId: d.categoryId, costCentreId: d.costCentreId || null, tripFrom: null, tripTo: null, customerId: null,
      travelRequestRef: d.travelRequestRef || null, receiptCount: Number(d.receiptCount) || 0, policyJustification: d.policyJustification || null,
      lines: d.lines.map((l) => ({ ...(l.id && { id: l.id }), description: l.description, expenseDate: l.expenseDate || null, categoryId: null, merchant: d.merchant || null, amount: Number(l.amount), costCentreId: null })),
    };
    try {
      let c = d.id ? await updateMyClaim(d.id, { ...body, rowVersion: d.rowVersion }) : await createMyClaim(body);
      setD((x) => ({ ...x, id: c.id, rowVersion: c.rowVersion, lines: c.lines.map((l) => ({ id: l.id, description: l.description, expenseDate: l.expenseDate ?? today(), amount: String(l.amount) })) }));
      if (submit) c = await myClaimAction(c.id, "submit", c.rowVersion);
      onSaved(c, submit);
    } catch (e) {
      if (e instanceof ApiError) {
        const f = Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""]));
        setErrors(f);
        setFailure(e.code === "CLAIM_POLICY_JUSTIFICATION" ? "This claim is over the policy limit. Explain why below, then submit again." : e.message);
      } else setFailure("Could not save the claim");
    }
    setBusy(null);
  };

  return (
    <Modal open onClose={onClose} wide title={d.id ? "Edit expense claim" : "New expense claim"} subtitle="Your line manager, then Finance, approve it"
      foot={phase === "form" ? <>
        <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
        <button className="btn secondary" type="button" onClick={() => save(false)} disabled={!!busy || !ready}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
        <button className="btn primary" type="button" onClick={() => save(true)} disabled={!!busy || !ready}><Send />{busy === "submit" ? "Submitting…" : "Submit claim"}</button>
      </> : <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>}>
      {phase === "capture" ? (
        <div className="es-ex-capture">
          <div className="es-ex-dz" aria-disabled="true" title={LATER}><span className="es-ex-dzic"><ScanLine /></span><b>Drop a receipt here</b><span>{LATER}</span></div>
          <div className="es-ex-or"><span>or</span></div>
          <div className="es-ex-capbtns">
            <button type="button" className="btn primary lg" disabled title={LATER}><Camera />Use camera</button>
            <button type="button" className="btn ghost" onClick={() => setPhase("form")}><Keyboard />Enter manually</button>
          </div>
        </div>
      ) : (
        <div className="es-ex-form">
          <span className="es-ex-conf"><PenLine />Manual entry · keep the paper receipt</span>
          {failure && <Banner tone="danger" title={failure} />}
          <FormGrid>
            <Field label="Purpose" required full error={errors.title}><Input value={d.title} maxLength={120} placeholder="Client, route or reason" onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Merchant" error={errors.merchant}><Input value={d.merchant} maxLength={120} placeholder="e.g. PSO Service Station" onChange={(e) => set("merchant", e.target.value)} /></Field>
            <Field label="Category" required error={errors.categoryId}>
              <Select value={d.categoryId} onChange={(e) => set("categoryId", e.target.value)} aria-invalid={!!errors.categoryId}>
                <option value="">Select…</option>
                {opts.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Project / cost centre" error={errors.costCentreId}>
              <Select value={d.costCentreId} onChange={(e) => set("costCentreId", e.target.value)}>
                <option value="">None</option>
                {opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Receipts held" hint={cat?.receiptRequired ? "This category needs a receipt" : "Paper receipts you keep for Finance"} error={errors.receiptCount}><Input type="number" min={0} max={50} value={d.receiptCount} onChange={(e) => set("receiptCount", e.target.value)} /></Field>
            {cat?.requiresPreApproval && <Field label="Travel request" hint="Pre-approval reference (TR-…)" error={errors.travelRequestRef}><Input value={d.travelRequestRef} maxLength={40} onChange={(e) => set("travelRequestRef", e.target.value)} /></Field>}
          </FormGrid>

          <div className="es-ex-itemhead"><span>Item</span><span className="es-ex-idate">Date</span><span>Amount (Rs)</span><span /></div>
          <div className="es-ex-items">
            {d.lines.map((l, i) => (
              <div key={l.id ?? `n${i}`} className="es-ex-item">
                <input value={l.description} maxLength={200} placeholder="What was it?" aria-label={`Item ${i + 1}`} aria-invalid={!!errors[`lines.${i}.description`]} onChange={(e) => setLine(i, { description: e.target.value })} />
                <input className="es-ex-idate" type="date" value={l.expenseDate} aria-label={`Item ${i + 1} date`} onChange={(e) => setLine(i, { expenseDate: e.target.value })} />
                <input inputMode="decimal" value={l.amount} placeholder="0" aria-label={`Item ${i + 1} amount`} aria-invalid={!!errors[`lines.${i}.amount`]} onChange={(e) => setLine(i, { amount: e.target.value.replace(/[^\d.]/g, "") })} />
                <button type="button" className="x" aria-label="Remove item" disabled={d.lines.length === 1} onClick={() => setD((x) => ({ ...x, lines: x.lines.filter((_, j) => j !== i) }))}><Trash2 /></button>
              </div>
            ))}
            <button type="button" className="btn ghost" style={{ alignSelf: "flex-start" }} onClick={() => setD((x) => ({ ...x, lines: [...x.lines, { description: "", expenseDate: today(), amount: "" }] }))}><Plus />Add item</button>
          </div>
          <div className="es-ex-total"><span>Total claimed</span><b>{rs(total)}</b></div>

          {pol && (
            <div className={`es-ex-polc ${pol.isOver ? "warn" : near ? "warn" : cat?.requiresPreApproval ? "info" : "good"}`}>
              {pol.isOver || near ? <TriangleAlert /> : cat?.requiresPreApproval ? <Info /> : <CircleCheck />}
              <div>
                <b>{pol.isOver ? `${pol.message} by ${rs((cat!.limitPeriod === "PER_MONTH" ? cat!.usedThisMonth + total : total) - cat!.limitAmount!)}` : cat?.requiresPreApproval && !pol.limitAmount ? `${cat.name} needs pre-approval` : pol.message}</b>
                <span>{cat!.limitPeriod === "PER_MONTH" && cat!.limitAmount ? `You have claimed ${rs(cat!.usedThisMonth)} of ${rs(cat!.limitAmount)} this month. ` : ""}{pol.isOver ? "Add a justification; your line manager and Finance decide." : cat?.requiresPreApproval ? "Quote your travel request so Finance can match it." : ""}</span>
              </div>
            </div>
          )}
          {(pol?.isOver || d.policyJustification) && <Field label="Justification" required={pol?.isOver} error={errors.policyJustification}><Textarea rows={2} maxLength={500} value={d.policyJustification} placeholder="Why the extra spend was needed" onChange={(e) => set("policyJustification", e.target.value)} /></Field>}
        </div>
      )}
    </Modal>
  );
}
