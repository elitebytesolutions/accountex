"use client";

import { Copy, Eye, History, Info, MoreHorizontal, Pause, Pencil, Play, Search, Shuffle, TicketPercent, TicketPlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { couponErrors, type Coupon, type CouponRedemption, type PartnerOption, type SubscriptionPlan } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, Switch } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { couponRedemptions, createCoupon, deleteCoupon, listCoupons, listPartnerOptions, listPlans, setCouponPaused, updateCoupon } from "../api";
import { activePlans, fmtDate, PlanPill, rs } from "./catalogue-ui";

type Form = {
  code: string; discountType: "PERCENT" | "FLAT"; discountValue: string; duration: string; redemptionCap: string;
  startsOn: string; expiresOn: string; newCustomersOnly: boolean; stackableWithPartner: boolean; partnerId: string; planIds: string[];
};
const DURATIONS: [string, string][] = [["ONCE", "Once"], ["MONTHS_3", "3 months"], ["MONTHS_6", "6 months"], ["MONTHS_12", "12 months"], ["FOREVER", "Forever"]];
const durLabel = (d: string) => DURATIONS.find(([k]) => k === d)?.[1] ?? d;
const MONTHS: Record<string, number> = { ONCE: 1, MONTHS_3: 3, MONTHS_6: 6, MONTHS_12: 12, FOREVER: 24 };
const STATUS_TONE: Record<string, string> = { ACTIVE: "good", SCHEDULED: "info", EXPIRED: "neutral", PAUSED: "warn" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", SCHEDULED: "Scheduled", EXPIRED: "Expired", PAUSED: "Paused" };
const WORDS = ["RAMZAN", "EID", "AZADI", "GROW", "SME", "KARACHI", "LAHORE", "BOOKS"];
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
const blank = (planIds: string[]): Form => ({
  code: "", discountType: "PERCENT", discountValue: "25", duration: "MONTHS_3", redemptionCap: "", startsOn: today(), expiresOn: "",
  newCustomersOnly: true, stackableWithPartner: false, partnerId: "", planIds,
});
const fromCoupon = (c: Coupon): Form => ({
  code: c.code.toUpperCase(), discountType: c.discountType as Form["discountType"], discountValue: String(c.discountValue), duration: c.duration,
  redemptionCap: c.redemptionCap === null ? "" : String(c.redemptionCap), startsOn: c.startsOn, expiresOn: c.expiresOn ?? "",
  newCustomersOnly: c.newCustomersOnly, stackableWithPartner: c.stackableWithPartner, partnerId: c.partner?.id ?? "", planIds: c.planIds,
});
const bodyOf = (f: Form) => ({ ...f, code: f.code.trim().toUpperCase() });
const offText = (type: string, v: number) => (type === "PERCENT" ? `${v}%` : rs(v));

/** The generator form fields (template ap-cgen panel); shared by the generator and the edit modal. */
function CouponFields({ f, set, plans, partners, errs, onShuffle }: {
  f: Form; set: (patch: Partial<Form>) => void; plans: SubscriptionPlan[]; partners: PartnerOption[]; errs: Record<string, string>; onShuffle?: () => void;
}) {
  return (
    <>
      <div className="form-grid">
        <div className="field full">
          <span>Code</span>
          <div className="ap-codein">
            <input name="code" value={f.code} autoComplete="off" spellCheck={false} maxLength={24} placeholder="ACCOUNTEX-RAMZAN25" aria-invalid={!!errs.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "") })} />
            {onShuffle && <button className="btn ghost sm" type="button" onClick={onShuffle}><Shuffle />Shuffle</button>}
          </div>
          {errs.code && <small className="hint text-danger" role="alert">{errs.code}</small>}
        </div>
        <div className="field">
          <span>Discount type</span>
          <div className="seg">
            <button type="button" className={cn(f.discountType === "PERCENT" && "active")} onClick={() => set({ discountType: "PERCENT", discountValue: "25" })}>Percent</button>
            <button type="button" className={cn(f.discountType === "FLAT" && "active")} onClick={() => set({ discountType: "FLAT", discountValue: "5000" })}>Flat (Rs)</button>
          </div>
        </div>
        <Field label="Value" error={errs.discountValue}><input type="number" min={1} max={f.discountType === "PERCENT" ? 100 : undefined} value={f.discountValue} onChange={(e) => set({ discountValue: e.target.value })} /></Field>
        <Field label="Duration" error={errs.duration}><select value={f.duration} onChange={(e) => set({ duration: e.target.value })}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Redemption cap" error={errs.redemptionCap}><input type="number" min={1} value={f.redemptionCap} placeholder="Blank = unlimited" onChange={(e) => set({ redemptionCap: e.target.value })} /></Field>
        <Field label="Starts" error={errs.startsOn}><input type="date" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></Field>
        <Field label="Expires" error={errs.expiresOn}><input type="date" value={f.expiresOn} min={f.startsOn || undefined} onChange={(e) => set({ expiresOn: e.target.value })} /></Field>
        <Field label="Partner" error={errs.partnerId} hint={partners.length ? undefined : "Resellers are added in Partners (Phase 38)"}>
          <select value={f.partnerId} onChange={(e) => set({ partnerId: e.target.value })}>
            <option value="">No partner</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="ap-lbl ap-mt">Applies to plans</div>
      <div className="ap-chipsel">
        {plans.map((p) => (
          <button key={p.id} type="button" className={cn(f.planIds.includes(p.id) && "on")}
            onClick={() => set({ planIds: f.planIds.includes(p.id) ? f.planIds.filter((x) => x !== p.id) : [...f.planIds, p.id] })}>{p.name}</button>
        ))}
      </div>
      {errs.planIds && <small className="hint text-danger" role="alert">{errs.planIds}</small>}
      <div className="ap-switches">
        <Switch label="New customers only" checked={f.newCustomersOnly} onChange={(e) => set({ newCustomersOnly: e.target.checked })} />
        <Switch label="Stackable with partner discounts" checked={f.stackableWithPartner} onChange={(e) => set({ stackableWithPartner: e.target.checked })} />
      </div>
    </>
  );
}

/** Client-side check before sending (same rules as the API). */
function check(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Z0-9-]{4,24}$/.test(f.code.trim().toUpperCase())) e.code = "4–24 letters, digits or dashes";
  if (!(Number(f.discountValue) > 0)) e.discountValue = "More than 0";
  if (!f.startsOn) e.startsOn = "Choose a start date";
  if (!f.planIds.length) e.planIds = "Pick at least one plan";
  return { ...e, ...couponErrors({ discountType: f.discountType, discountValue: Number(f.discountValue), startsOn: f.startsOn, expiresOn: f.expiresOn || null }) };
}

/**
 * Template admin/partners › Coupons (3A-admin-plus.html, 9B-admin-plus.js 1316+): the coupon generator with a live ticket
 * preview, and the "All coupons" table with its row menu (copy, pause / resume, delete). Added: edit (with History) and a
 * read-only redemptions drawer.
 */
export function CouponsTab({ focusKey = 0 }: { focusKey?: number }) {
  const toast = useToast();
  const genRef = useRef<HTMLDivElement>(null);
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [f, setF] = useState<Form>(blank([]));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<{ anchor: HTMLElement; coupon: Coupon } | null>(null);
  const [edit, setEdit] = useState<{ coupon: Coupon; form: Form; tab: "form" | "history" } | null>(null);
  const [editErrs, setEditErrs] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<Coupon | null>(null);
  const [redeemed, setRedeemed] = useState<{ coupon: Coupon; rows: CouponRedemption[] | null } | null>(null);

  // "New coupon" (page head) scrolls to the generator and focuses the code, as in the template.
  useEffect(() => {
    if (!focusKey) return;
    genRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => { const i = genRef.current?.querySelector<HTMLInputElement>("input[name=code]"); i?.focus(); i?.select(); }, 80);
    return () => clearTimeout(t);
  }, [focusKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCoupons(), listPlans(), listPartnerOptions()])
      .then(([c, p, r]) => {
        if (cancelled) return;
        const live = activePlans(p);
        setCoupons(c); setPlans(live); setPartners(r); setError(null);
        setF((x) => (x.planIds.length ? x : { ...x, planIds: live.slice(1, 3).map((pl) => pl.id) }));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load coupons" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const set = (patch: Partial<Form>) => { setF((x) => ({ ...x, ...patch })); setErrs({}); };
  const shuffle = () => set({ code: `ACCOUNTEX-${WORDS[Math.floor(Math.random() * WORDS.length)]}${Math.floor(10 + Math.random() * 40)}` });
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
    toast(what, { tone: "info", ms: 2200 });
  };

  async function create() {
    const e = check(f);
    if (Object.keys(e).length) { setErrs(e); toast(Object.values(e)[0]!, { tone: "warn" }); return; }
    setBusy(true);
    try {
      const c = await createCoupon(bodyOf(f));
      toast(`${c.code} created`, { tone: "good", action: { label: "Copy", onClick: () => void copy(c.code, `${c.code} copied`) } });
      setF(blank(f.planIds)); setQ(""); reload();
    } catch (err) {
      setErrs(adminFieldErrors(err)); toast(adminErrorMessage(err, "Could not create the coupon"), { tone: "danger" });
    } finally { setBusy(false); }
  }
  async function saveEdit() {
    if (!edit) return;
    const e = check(edit.form);
    if (Object.keys(e).length) { setEditErrs(e); return; }
    setBusy(true);
    try {
      await updateCoupon(edit.coupon.id, { ...bodyOf(edit.form), rowVersion: edit.coupon.rowVersion });
      toast(`${edit.form.code} saved`, { tone: "good" }); setEdit(null); reload();
    } catch (err) {
      setEditErrs(adminFieldErrors(err)); toast(adminErrorMessage(err, "Could not save the coupon"), { tone: "danger" });
    } finally { setBusy(false); }
  }
  async function act(work: () => Promise<unknown>, done: string, tone: "good" | "warn" | "danger" = "good") {
    try { await work(); toast(done, { tone }); reload(); }
    catch (err) { toast(adminErrorMessage(err, "Could not update the coupon"), { tone: "danger" }); }
  }
  function openRedemptions(c: Coupon) {
    setRedeemed({ coupon: c, rows: null });
    couponRedemptions(c.id).then((rows) => setRedeemed({ coupon: c, rows })).catch((err: unknown) => { toast(adminErrorMessage(err, "Could not load redemptions"), { tone: "danger" }); setRedeemed(null); });
  }
  const menuItems = (c: Coupon): MenuItem[] => [
    { label: "Copy code", icon: <Copy />, onClick: () => void copy(c.code, `${c.code} copied`) },
    { label: "Edit", icon: <Pencil />, onClick: () => { setEditErrs({}); setEdit({ coupon: c, form: fromCoupon(c), tab: "form" }); } },
    { label: "Redemptions", icon: <Eye />, onClick: () => openRedemptions(c) },
    { label: "History", icon: <History />, onClick: () => setEdit({ coupon: c, form: fromCoupon(c), tab: "history" }) },
    c.status === "PAUSED"
      ? { label: "Resume", icon: <Play />, onClick: () => void act(() => setCouponPaused(c.id, false, c.rowVersion), `${c.code} resumed`) }
      : { label: "Pause", icon: <Pause />, disabled: c.status === "EXPIRED", onClick: () => void act(() => setCouponPaused(c.id, true, c.rowVersion), `${c.code} paused`, "warn") },
    { sep: true },
    { label: "Delete", icon: <Trash2 />, danger: true, onClick: () => setRemove(c) },
  ];

  const v = Number(f.discountValue) || 0;
  const picked = plans.filter((p) => f.planIds.includes(p.id));
  const avg = picked.reduce((t, p) => t + p.priceMonthly, 0) / (picked.length || 1);
  const perInvoice = f.discountType === "PERCENT" ? (avg * v) / 100 : Math.min(v, avg);
  const cap = Number(f.redemptionCap) || 0;
  const list = (coupons ?? []).filter((c) => !q || c.code.toLowerCase().includes(q.toLowerCase()));
  const planName = (id: string) => plans.find((p) => p.id === id);

  return (
    <>
      <div className="ap-cgen" ref={genRef}>
        <div className="panel">
          <div className="panel-head"><div><h3>Coupon generator</h3><p>Codes are case-insensitive and validated at checkout</p></div></div>
          {!plans.length && coupons ? <EmptyState icon={<TicketPercent />} title="No plans on sale" description="Coupons apply to plans: create or reactivate a plan first." /> : (
            <>
              <CouponFields f={f} set={set} plans={plans} partners={partners} errs={errs} onShuffle={shuffle} />
              <div className="form-actions ap-mt"><button className="btn primary" type="button" disabled={busy || !coupons} onClick={create}><TicketPlus />{busy ? "Creating…" : "Create coupon"}</button></div>
            </>
          )}
        </div>
        <div className="ap-ticket-wrap">
          <div className="ap-ticket">
            <div className="ap-ticket-l">
              <small>Accountex Cloud · coupon</small>
              <b className="ap-ticket-off">{offText(f.discountType, v)}<span>off</span></b>
              <p>{f.duration === "ONCE" ? "first invoice" : f.duration === "FOREVER" ? "every invoice, forever" : `for ${durLabel(f.duration)}`}</p>
              <div className="ap-ticket-plans">{picked.length ? picked.map((p) => <PlanPill key={p.id} plan={p} kind="ap" />) : <span className="ap-muted-t">No plans selected</span>}</div>
            </div>
            <div className="ap-ticket-r">
              <code>{f.code || "CODE"}</code>
              <small>{fmtDate(f.startsOn || null)} → {fmtDate(f.expiresOn || null)}</small>
              <small>{cap ? `First ${cap.toLocaleString("en-PK")} redemptions` : "Unlimited redemptions"}{f.newCustomersOnly ? " · new customers" : ""}</small>
            </div>
          </div>
          <p className="ap-ticket-note"><Info /><span>Est. discount cost <b>{rs(Math.round(perInvoice * (MONTHS[f.duration] ?? 1) * (cap || 100) * 0.35))}</b> at a 35% redemption rate · {rs(Math.round(perInvoice))} off per invoice</span></p>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head">
          <div><h3>All coupons</h3><p>Redemptions are recorded when invoices are billed</p></div>
          <div className="panel-actions"><label className={cn("search-field ap-sf", q && "has-val")}><Search /><input placeholder="Search codes…" value={q} onChange={(e) => setQ(e.target.value)} /></label></div>
        </div>
        {!coupons ? <Skeleton style={{ height: 160, margin: 16 }} /> : (
          <div className="table-wrap"><table className="tbl ap-ctbl">
            <thead><tr><th>Code</th><th>Discount</th><th>Duration</th><th>Plans</th><th>Redemptions</th><th>Expires</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((c) => {
                const pct = c.redemptionCap ? (c.redemptions / c.redemptionCap) * 100 : 0;
                return (
                  <tr key={c.id}>
                    <td><div className="ap-cc"><code className="code">{c.code.toUpperCase()}</code><button className="icon-btn-sm" type="button" aria-label="Copy code" onClick={() => void copy(c.code, `${c.code} copied`)}><Copy /></button></div></td>
                    <td><b>{offText(c.discountType, c.discountValue)}</b> off</td>
                    <td>{durLabel(c.duration)}</td>
                    <td><div className="row ap-wrap ap-gap4">{c.planIds.map((id) => { const p = planName(id); return p ? <PlanPill key={id} plan={p} kind="ap" /> : null; })}</div></td>
                    <td>
                      {c.redemptionCap ? (
                        <div className={cn("ap-meter compact", pct >= 100 ? "full" : pct >= 80 ? "hot" : "")}><div className="ap-meter-top"><em>{c.redemptions} / {c.redemptionCap}</em></div><div className="ap-bar"><i style={{ ["--w" as string]: `${Math.min(100, pct).toFixed(1)}%` }} /></div></div>
                      ) : <span className="ap-muted-t">{c.redemptions} · no cap</span>}
                    </td>
                    <td>{fmtDate(c.expiresOn)}</td>
                    <td><span className={cn("badge dot", STATUS_TONE[c.status] ?? "neutral")}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                    <td className="actions"><button className="icon-btn-sm" type="button" aria-label="More" onClick={(e) => setMenu({ anchor: e.currentTarget, coupon: c })}><MoreHorizontal /></button></td>
                  </tr>
                );
              })}
              {!list.length && <tr><td colSpan={8}><EmptyState icon={<TicketPercent />} title={q ? "No coupons match" : "No coupons yet"} description={q ? "Try another code." : "Create one with the generator above."} /></td></tr>}
            </tbody>
          </table></div>
        )}
      </div>

      {menu && <Menu anchor={menu.anchor} items={menuItems(menu.coupon)} onClose={() => setMenu(null)} />}

      {edit && (
        <Modal open wide onClose={() => setEdit(null)} title={`Edit coupon — ${edit.coupon.code.toUpperCase()}`} subtitle={`${edit.coupon.redemptions} redemption${edit.coupon.redemptions === 1 ? "" : "s"} · ${STATUS_LABEL[edit.coupon.status] ?? edit.coupon.status}`}
          foot={edit.tab === "history"
            ? <button type="button" className="btn secondary" onClick={() => setEdit({ ...edit, tab: "form" })}><Pencil />Back to details</button>
            : <>
              <button type="button" className="btn ghost" onClick={() => setEdit({ ...edit, tab: "history" })}><History />History</button>
              <span className="spacer" />
              <button type="button" className="btn secondary" onClick={() => setEdit(null)}>Cancel</button>
              <button type="button" className="btn primary" disabled={busy} onClick={saveEdit}>{busy ? "Saving…" : "Save coupon"}</button>
            </>}>
          {edit.tab === "history"
            ? <AdminHistoryTab table="SubscriptionCoupons" id={edit.coupon.id} labels={{ SubscriptionCouponPlans: "Plan" }} />
            : <CouponFields f={edit.form} set={(patch) => { setEdit({ ...edit, form: { ...edit.form, ...patch } }); setEditErrs({}); }} plans={plans} partners={partners} errs={editErrs} />}
        </Modal>
      )}

      <ConfirmDialog open={!!remove} onClose={() => setRemove(null)} title={`Delete ${remove?.code.toUpperCase() ?? ""}?`} confirmLabel="Delete" danger
        onConfirm={() => { const c = remove; setRemove(null); if (c) void act(() => deleteCoupon(c.id, c.rowVersion), `${c.code} deleted`, "danger"); }}>
        The code stops working at checkout. A coupon that has been redeemed can only be paused.
      </ConfirmDialog>

      <Drawer open={!!redeemed} onClose={() => setRedeemed(null)} title={`${redeemed?.coupon.code.toUpperCase() ?? ""} · redemptions`} subtitle="Recorded by billing; read-only">
        {!redeemed?.rows ? <Skeleton style={{ height: 120 }} /> : !redeemed.rows.length ? (
          <EmptyState icon={<TicketPercent />} title="Not redeemed yet" description="Redemptions appear when tenants are billed with this code." />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Tenant</th><th>Redeemed</th><th className="num">Off per invoice</th><th className="num">Months left</th><th>Status</th></tr></thead>
            <tbody>{redeemed.rows.map((r) => (
              <tr key={r.id}><td><b>{r.tenant.name}</b></td><td>{fmtDate(r.redeemedAt)}</td><td className="num">{rs(r.discountPerInvoice)}</td><td className="num">{r.monthsRemaining ?? "—"}</td><td><span className="badge neutral">{r.status}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Drawer>
    </>
  );
}
