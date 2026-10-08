"use client";

import { Award, Building2, ClipboardCopy, FileText, Handshake, MapPin, Plus, RefreshCw, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { PAYOUT_METHODS, RESELLER_TIERS, type Reseller, type ResellerCreate } from "@/shared";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { ErrorState, EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf, lookupOptions } from "@/features/settings/use-lookups";
import { createReseller, deleteReseller, listResellers, regenerateInviteCode, setResellerStatus, updateReseller } from "../api";
import { copyText, Logo, useLoad } from "./config-ui";
// Phase 41: payouts, statements and reseller–tenant attribution
import { listPayouts } from "@/features/platform-billing/api";
import { BILLING_LOOKUPS, fmtDate, rs0 } from "@/features/platform-billing/components/billing-ui";
import { CalculatePayoutsButton, partnerPayout, StatementDrawer } from "@/features/platform-billing/components/reseller-payouts";

const LOOKUPS = ["Tier", "ResellerStatus", "PayoutMethod", ...BILLING_LOOKUPS];
const TIER_TONE: Record<string, string> = { PLATINUM: "violet", GOLD: "warn", SILVER: "neutral", BRONZE: "orange" };
const NEXT_TIER: Record<string, string | null> = { BRONZE: "SILVER", SILVER: "GOLD", GOLD: "PLATINUM", PLATINUM: null };
const STATUS_TONE: Record<string, string> = { ACTIVE: "good", SUSPENDED: "warn", TERMINATED: "danger" };

type Form = {
  name: string; city: string; tier: string; commissionPct: string; nextTierTenants: string; contactName: string; email: string; phone: string;
  ntn: string; isActiveTaxpayer: boolean; payoutMethod: string; bankName: string; iban: string;
};
const blank: Form = { name: "", city: "", tier: "BRONZE", commissionPct: "10", nextTierTenants: "", contactName: "", email: "", phone: "", ntn: "", isActiveTaxpayer: false, payoutMethod: "IBFT", bankName: "", iban: "" };
const toForm = (r: Reseller): Form => ({
  name: r.name, city: r.city ?? "", tier: r.tier, commissionPct: String(r.commissionPct), nextTierTenants: r.nextTierTenants?.toString() ?? "", contactName: r.contactName ?? "",
  email: r.email ?? "", phone: r.phone ?? "", ntn: r.ntn ?? "", isActiveTaxpayer: r.isActiveTaxpayer, payoutMethod: r.payoutMethod, bankName: r.bankName ?? "", iban: "",
});

/**
 * Partners & Coupons › Resellers (template admin/partners Resellers tab, 9B-admin-plus.js 1316+): KPIs and partner cards
 * (tier, tenants, commission, progress to the next tier, payout due). Phase 41 adds MRR, payouts, the Statement drawer
 * (with "Attribute tenant") and "Calculate payouts". Template-style addition: the reseller create / edit modal and the per-partner invite code.
 * `openNew` opens the New reseller modal (the page's "Partner invite link" button); `onNewClosed` tells the page it closed.
 */
export function ResellersTab({ openNew = false, onNewClosed }: { openNew?: boolean; onNewClosed?: () => void }) {
  const toast = useToast();
  const lookups = useAdminLookups(LOOKUPS);
  const { data: rows, error, reload } = useLoad(listResellers, "Could not load resellers");
  const { data: payouts, reload: reloadPayouts } = useLoad(() => listPayouts(), "Could not load payouts");
  const [statement, setStatement] = useState<Reseller | null>(null);
  const [edit, setEdit] = useState<Reseller | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const open = (r: Reseller | "new") => { setEdit(r); setErrs({}); setForm(r === "new" ? blank : toForm(r)); };
  // The page asks for the New reseller form (adjusted during render, no effect); closing the modal reports back.
  const [askedNew, setAskedNew] = useState(false);
  if (openNew !== askedNew) { setAskedNew(openNew); if (openNew) open("new"); }
  const close = () => { setEdit(null); onNewClosed?.(); };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const row = edit && edit !== "new" ? edit : null;

  const run = async (fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, { tone: "good" });
      reload();
      return true;
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, fail), { tone: "danger" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const body: ResellerCreate = {
      name: form.name, city: form.city || null, tier: form.tier as ResellerCreate["tier"], commissionPct: Number(form.commissionPct),
      nextTierTenants: form.nextTierTenants ? Number(form.nextTierTenants) : null, contactName: form.contactName || null, email: form.email || null,
      phone: form.phone || null, ntn: form.ntn || null, isActiveTaxpayer: form.isActiveTaxpayer, payoutMethod: form.payoutMethod as ResellerCreate["payoutMethod"],
      bankName: form.bankName || null, iban: form.iban || undefined,
    };
    if (await run(() => (row ? updateReseller(row.id, { ...body, rowVersion: row.rowVersion }) : createReseller(body)), `${form.name} saved`, "Could not save the reseller")) close();
  };

  const all = rows ?? [];
  const byTier = RESELLER_TIERS.map((t) => [t, all.filter((r) => r.tier === t).length] as const).filter(([, n]) => n > 0);
  const tenants = all.reduce((s, r) => s + r.tenantsCount, 0);

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 12 }}>
        <CalculatePayoutsButton onDone={reloadPayouts} />
        <button type="button" className="btn secondary" onClick={() => open("new")} style={{ marginLeft: 8 }}><Plus />New reseller</button>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Partners</span><span className="icon-well"><Handshake /></span></div>
          <strong>{rows ? all.length : "…"}</strong><small>{byTier.length ? byTier.map(([t, n]) => `${n} ${labelOf(lookups, "Tier", t)}`).join(" · ") : "No partners yet"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Tenants via partners</span><span className="icon-well"><Building2 /></span></div>
          <strong>{rows ? tenants : "…"}</strong><small>Attributed companies</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Partner-sourced MRR</span><span className="icon-well"><TrendingUp /></span></div>
          <strong>{payouts ? rs0(payouts.kpis.partnerMrr) : "—"}</strong><small>From live attributions</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Commission due</span><span className="icon-well"><Wallet /></span></div>
          <strong>{payouts ? rs0(payouts.kpis.commissionDue) : "—"}</strong><small>{payouts ? `${payouts.kpis.dueCount} payout${payouts.kpis.dueCount === 1 ? "" : "s"} due · WHT 12% u/s 233` : "Net of WHT 12% u/s 233"}</small></div>
      </div>

      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}
      {!rows ? <div className="ap-pgrid"><div className="card ap-pcard"><Skeleton style={{ height: 180 }} /></div></div> : rows.length === 0 ? (
        <div className="panel"><EmptyState icon={<Handshake />} title="No resellers yet" description="Add your first partner. Each gets an invite code for the tenants they bring."
          action={<button type="button" className="btn primary" onClick={() => open("new")}><Plus />New reseller</button>} /></div>
      ) : (
        <div className="ap-pgrid">
          {rows.map((p, i) => {
            const next = NEXT_TIER[p.tier] ?? null;
            const goal = p.nextTierTenants;
            const mrr = payouts?.commissions.find((c) => c.partnerId === p.id)?.sourcedMrr ?? 0;
            const po = partnerPayout(payouts, p.id);
            return (
              <div key={p.id} className="card ap-pcard" style={{ ["--i" as string]: i, cursor: "pointer" }} role="button" tabIndex={0}
                onClick={() => open(p)} onKeyDown={(e) => e.key === "Enter" && open(p)}>
                <div className="ap-pcard-top"><Logo name={p.name} size="lg" />
                  <div><b>{p.name}</b><small><MapPin />{p.city ?? "—"}</small></div>
                  <span className={`badge ${TIER_TONE[p.tier] ?? "neutral"} ap-tier`}><Award />{labelOf(lookups, "Tier", p.tier)}</span></div>
                <div className="ap-pstats">
                  <div><small>Tenants</small><b>{p.tenantsCount}</b></div>
                  <div><small>Commission</small><b>{p.commissionPct}%</b></div>
                  <div><small>Their MRR</small><b>{payouts ? (mrr >= 1000 ? `${Math.round(mrr / 1000)}k` : Math.round(mrr)) : "—"}</b></div>
                </div>
                <div className="ap-ptier">
                  <div className="row">
                    <small>{!next ? "Top tier" : goal ? `${Math.max(0, goal - p.tenantsCount)} more tenants to ${labelOf(lookups, "Tier", next)}` : `Set a target for ${labelOf(lookups, "Tier", next)}`}</small>
                    <span className="spacer" />{goal && next ? <small>{p.tenantsCount}/{goal}</small> : null}</div>
                  <div className="ap-bar thin"><i style={{ ["--w" as string]: `${goal && next ? Math.min(100, (p.tenantsCount / goal) * 100) : next ? 0 : 100}%` }} /></div>
                </div>
                <div className="row small" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {p.status !== "ACTIVE" && <span className={`badge ${STATUS_TONE[p.status] ?? "neutral"} dot`}>{labelOf(lookups, "ResellerStatus", p.status)}</span>}
                  <code className="code">{p.inviteCode ?? "—"}</code>
                  <button type="button" className="icon-btn-sm" aria-label="Copy invite code" disabled={!p.inviteCode}
                    onClick={async () => toast((await copyText(p.inviteCode!)) ? `Invite code ${p.inviteCode} copied` : "Could not copy", { tone: "info" })}><ClipboardCopy /></button>
                  <button type="button" className="icon-btn-sm" aria-label="New invite code" disabled={busy}
                    onClick={() => run(() => regenerateInviteCode(p.id, p.rowVersion), `New invite code for ${p.name}; the old one stops working`, "Could not regenerate the code")}><RefreshCw /></button>
                </div>
                <div className="ap-pdue"><div><small>Payout due</small><b>{po?.status === "DUE" ? rs0(po.netAmount) : po?.status === "PAID" ? <span className="badge good dot">Paid · {fmtDate(po.paidOn)}</span> : "—"}</b></div>
                  <button type="button" className="btn secondary sm" onClick={(e) => { e.stopPropagation(); setStatement(p); }}><FileText />Statement</button></div>
              </div>
            );
          })}
        </div>
      )}

      <StatementDrawer partner={statement} payouts={payouts} lookups={lookups} onClose={() => setStatement(null)} onChanged={() => { reloadPayouts(); reload(); }} />
      <AdminRecordModal open={edit !== null} onClose={() => close()} title={row ? `Edit ${row.name}` : "New reseller"}
        subtitle={row ? `Invite code ${row.inviteCode ?? "—"}` : "An invite code is generated on save"} wide busy={busy} saveLabel={row ? "Save" : "Create reseller"} onSave={save}
        history={row ? { table: "Resellers", id: row.id } : null}
        onDelete={row ? async () => { if (await run(() => deleteReseller(row.id, row.rowVersion), `${row.name} deleted`, "Could not delete the reseller")) close(); } : undefined}
        deleteNote="Only a partner with no tenants, payouts, leads or coupons can be deleted. Suspend or terminate it otherwise."
        extra={row && (
          <select aria-label="Status" value={row.status} disabled={busy}
            onChange={async (e) => { if (await run(() => setResellerStatus(row.id, e.target.value, row.rowVersion), `${row.name} is now ${labelOf(lookups, "ResellerStatus", e.target.value).toLowerCase()}`, "Could not change the status")) close(); }}>
            {lookupOptions(lookups, "ResellerStatus", row.status).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        )}>
        <FormGrid>
          <Field label="Name" required error={errs.name}><input value={form.name} maxLength={120} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="City" error={errs.city}><input value={form.city} maxLength={60} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Tier" error={errs.tier}><select value={form.tier} onChange={(e) => set("tier", e.target.value)}>
            {RESELLER_TIERS.map((t) => <option key={t} value={t}>{labelOf(lookups, "Tier", t)}</option>)}</select></Field>
          <Field label="Commission (%)" required error={errs.commissionPct}><input type="number" min={0} max={100} step="0.5" value={form.commissionPct} onChange={(e) => set("commissionPct", e.target.value)} /></Field>
          <Field label="Tenants for the next tier" error={errs.nextTierTenants} hint="Target shown as progress on the card"><input type="number" min={1} value={form.nextTierTenants} onChange={(e) => set("nextTierTenants", e.target.value)} /></Field>
          <Field label="Contact person" error={errs.contactName}><input value={form.contactName} maxLength={120} onChange={(e) => set("contactName", e.target.value)} /></Field>
          <Field label="Email" error={errs.email}><input type="email" value={form.email} maxLength={160} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone" error={errs.phone}><input value={form.phone} maxLength={30} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="NTN" error={errs.ntn}><input value={form.ntn} placeholder="1234567-8" onChange={(e) => set("ntn", e.target.value)} /></Field>
          <div className="field" style={{ alignSelf: "end" }}><Switch label="Active taxpayer (ATL)" checked={form.isActiveTaxpayer} onChange={(e) => set("isActiveTaxpayer", e.target.checked)} /></div>
          <Field label="Payout method" error={errs.payoutMethod}><select value={form.payoutMethod} onChange={(e) => set("payoutMethod", e.target.value)}>
            {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{labelOf(lookups, "PayoutMethod", m)}</option>)}</select></Field>
          <Field label="Bank" error={errs.bankName}><input value={form.bankName} maxLength={80} placeholder="e.g. Meezan Bank" onChange={(e) => set("bankName", e.target.value)} /></Field>
          <Field label="IBAN" full error={errs.iban} hint={row?.ibanMasked ? `On file: ${row.ibanMasked}. Leave blank to keep it; it is stored encrypted and never shown again.` : "Stored encrypted; only a mask is ever shown."}>
            <input value={form.iban} autoComplete="off" spellCheck={false} placeholder="PK36 MEZN 0001 2345 6789 4471" onChange={(e) => set("iban", e.target.value)} />
          </Field>
        </FormGrid>
      </AdminRecordModal>
    </>
  );
}
