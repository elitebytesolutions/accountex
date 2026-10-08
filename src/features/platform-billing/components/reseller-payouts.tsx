"use client";

import { Banknote, Calculator, History, Link2, Send, Unlink, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LookupsResponse, PayoutList, Reseller, ResellerAttribution, ResellerPayout, TenantListItem } from "@/shared";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { listTenants } from "@/features/platform-tenants/api";
import { calculatePayouts, cancelPayout, listAttributions, payPayout, setAttribution } from "../api";
import { fmtDate, Logo, LookupBadge, money, monthLabel, rs0, todayPk } from "./billing-ui";

/** The partner's DUE payout (oldest first), else its latest one. */
export const partnerPayout = (payouts: PayoutList | null, partnerId: string): ResellerPayout | null => {
  const mine = (payouts?.items ?? []).filter((p) => p.partnerId === partnerId);
  return [...mine].filter((p) => p.status === "DUE").sort((a, b) => (a.periodMonth < b.periodMonth ? -1 : 1))[0] ?? mine[0] ?? null;
};

/**
 * Partners & Coupons › Resellers › Statement (template 9B-admin-plus.js 1377–1398): gross commission, WHT 12% u/s 233,
 * net payable, the per-company statement, pay-to details and "Mark as paid". "Email PDF" opens the statement's print
 * view (emailing waits for Phase 29). Template-style additions: the partner's attributed companies ("Attribute
 * tenant" / end) and the payout's history.
 */
export function StatementDrawer({ partner, payouts, lookups, onClose, onChanged }: {
  partner: Reseller | null; payouts: PayoutList | null; lookups: LookupsResponse; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [attr, setAttr] = useState<ResellerAttribution[] | null>(null);
  const [attrError, setAttrError] = useState<string | null>(null);
  const [attrKey, setAttrKey] = useState(0);
  const [paying, setPaying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [attributing, setAttributing] = useState(false);
  const [ending, setEnding] = useState<ResellerAttribution | null>(null);
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!partner) return;
    let cancelled = false;
    listAttributions(partner.id).then((a) => { if (!cancelled) { setAttr(a); setAttrError(null); } }).catch((e: unknown) => !cancelled && setAttrError(adminErrorMessage(e, "Could not load the companies")));
    return () => { cancelled = true; };
  }, [partner, attrKey]);
  const p = partner ? partnerPayout(payouts, partner.id) : null;
  const commission = partner ? payouts?.commissions.find((c) => c.partnerId === partner.id) : undefined;
  const live = (attr ?? []).filter((a) => !a.endedOn);

  const end = async () => {
    if (!partner || !ending) return;
    setBusy(true);
    try {
      await setAttribution(partner.id, { action: "end", tenantId: ending.tenantId });
      toast(`${ending.tenantName} no longer attributed to ${partner.name}`, { tone: "warn" });
      setEnding(null); setAttrKey((n) => n + 1); onChanged();
    } catch (e) { toast(adminErrorMessage(e, "Could not end the attribution"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!p) return;
    setBusy(true);
    try {
      await cancelPayout(p.id, p.rowVersion);
      toast(`${monthLabel(p.periodMonth.slice(0, 7))} payout cancelled`, { tone: "warn" });
      setCancelling(false); onChanged();
    } catch (e) { toast(adminErrorMessage(e, "Could not cancel the payout"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <>
      <Drawer open={!!partner} onClose={onClose} wide title={partner ? `${partner.name} · statement` : ""}
        subtitle={partner ? `${p ? monthLabel(p.periodMonth.slice(0, 7)) : "No payout calculated yet"} · ${labelTier(partner.tier)} tier at ${p?.commissionPct ?? partner.commissionPct}%` : ""}
        foot={partner ? <>
          {p && <Link className="btn secondary" href={`/admin/payouts/${p.id}/print`} target="_blank" title="Opens the statement's print view; emailing it arrives with Phase 29"><Send />Email PDF</Link>}
          {p?.status === "DUE" && <button type="button" className="btn ghost" onClick={() => setCancelling(true)}><XCircle />Cancel payout</button>}
          <button type="button" className="btn primary" disabled={p?.status !== "DUE"} onClick={() => setPaying(true)}><Banknote />{p?.status === "PAID" ? `Paid · ${fmtDate(p.paidOn)}` : "Mark as paid"}</button>
        </> : undefined}>
        {partner && (
          <>
            <div className="ap-stmt-head">
              <div><small>Gross commission</small><b>{rs0(p?.grossAmount ?? commission?.expectedCommission ?? 0)}</b></div>
              <div><small>WHT {p?.whtRate ?? 12}% · u/s {p?.whtSection ?? "233"}</small><b className="ap-danger-t">− {rs0(p?.whtAmount ?? Math.round((commission?.expectedCommission ?? 0) * 0.12 * 100) / 100)}</b></div>
              <div className="net"><small>Net payable</small><b>{rs0(p?.netAmount ?? (commission?.expectedCommission ?? 0) * 0.88)}</b></div>
            </div>
            {!p && <p className="small muted ap-mt">Expected from the current attributions. Calculate the month&apos;s payouts to freeze a statement.</p>}
            {p && <div className="row small ap-mt" style={{ gap: 8 }}><LookupBadge lookups={lookups} type="ResellerPayoutStatus" code={p.status} dot />{p.paymentRef && <span className="muted">Ref {p.paymentRef}{p.whtCertificateNo ? ` · WHT cert ${p.whtCertificateNo}` : ""}</span>}<span className="spacer" />
              <button type="button" className="btn ghost sm" onClick={() => setHistory(true)}><History />History</button></div>}
            <div className="table-wrap ap-mt"><table className="tbl" data-plain>
              <thead><tr><th>Tenant</th><th>Plan</th><th className="num">MRR (Rs)</th><th className="num">Commission</th></tr></thead>
              <tbody>
                {(p ? p.statementLines : live.map((a) => ({ tenantId: a.tenantId, tenantName: a.tenantName, planName: null as string | null, mrr: a.mrr, commission: Math.round((a.mrr * (a.commissionPctOverride ?? partner.commissionPct)) / 100 * 100) / 100 }))).map((l) => (
                  <tr key={l.tenantId}><td><div className="cell-user"><Logo name={l.tenantName} size="xs" /><b>{l.tenantName}</b></div></td><td>{l.planName ?? "—"}</td><td className="num">{money(l.mrr)}</td><td className="num">{money(l.commission)}</td></tr>
                ))}
                {(p ? p.statementLines.length : live.length) === 0 && <tr><td colSpan={4} className="ap-muted-t">No companies in this statement.</td></tr>}
                <tr className="total"><td colSpan={3}>Total commission</td><td className="num">{money(p?.grossAmount ?? commission?.expectedCommission ?? 0)}</td></tr>
              </tbody>
            </table></div>
            <div className="dl ap-mt">
              <div><span>Pay to</span><b>{partner.ibanMasked ?? "No IBAN on file"}</b></div>
              <div><span>Payout method</span><b>{partner.payoutMethod === "CHEQUE" ? "Cheque" : `IBFT${partner.bankName ? ` via ${partner.bankName}` : ""}`}</b></div>
              <div><span>NTN on file</span><b>{partner.ntn ? `Yes${partner.isActiveTaxpayer ? " · active taxpayer" : " · not on the ATL"}` : "No"}</b></div>
            </div>

            <div className="panel-head ap-mt" style={{ padding: 0 }}><div><h3>Attributed companies</h3><p>One partner per company; commission comes from their MRR</p></div>
              <div className="panel-actions"><button type="button" className="btn secondary sm" disabled={partner.status !== "ACTIVE"} title={partner.status !== "ACTIVE" ? "Reactivate the partner first" : undefined} onClick={() => setAttributing(true)}><Link2 />Attribute tenant</button></div></div>
            {attrError ? <ErrorState message={attrError} onRetry={() => setAttrKey((n) => n + 1)} /> : !attr ? <Skeleton style={{ height: 60 }} /> : attr.length === 0 ? <p className="muted small">No companies attributed yet.</p> : (
              <div className="list">
                {attr.map((a) => (
                  <div key={a.id} className="list-item">
                    <Logo name={a.tenantName} size="xs" />
                    <div><b><Link className="link" href={`/admin/tenants/${a.tenantId}`}>{a.tenantName}</Link></b><small>Since {fmtDate(a.attributedOn)}{a.endedOn ? ` · ended ${fmtDate(a.endedOn)}` : ""}{a.commissionPctOverride !== null ? ` · ${a.commissionPctOverride}% override` : ""} · MRR {rs0(a.mrr)}</small></div>
                    <span className="spacer" />
                    {!a.endedOn && <button type="button" className="icon-btn-sm" title="End attribution" aria-label="End attribution" onClick={() => setEnding(a)}><Unlink /></button>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Drawer>
      <PayModal payout={paying ? p : null} partnerName={partner?.name ?? ""} onClose={() => setPaying(false)} onDone={() => { setPaying(false); onChanged(); }} />
      <AttributeModal open={attributing} partner={partner} existing={attr ?? []} onClose={() => setAttributing(false)} onDone={() => { setAttributing(false); setAttrKey((n) => n + 1); onChanged(); }} />
      <ConfirmDialog open={!!ending} onClose={() => setEnding(null)} onConfirm={end} busy={busy} title={`End ${ending?.tenantName ?? ""}'s attribution?`} confirmLabel="End attribution">
        From today the company no longer earns {partner?.name ?? "the partner"} commission. Payouts already calculated stay as they are.
      </ConfirmDialog>
      <ConfirmDialog open={cancelling} onClose={() => setCancelling(false)} onConfirm={cancel} busy={busy} danger title="Cancel this payout?" confirmLabel="Cancel payout">
        The {p ? monthLabel(p.periodMonth.slice(0, 7)) : ""} statement stays on record as cancelled.
      </ConfirmDialog>
      <Modal open={history && !!p} onClose={() => setHistory(false)} title="Payout history" subtitle={partner?.name ?? ""} wide>
        {p && <AdminHistoryTab table="ResellerPayouts" id={p.id} reloadKey={p.rowVersion} />}
      </Modal>
    </>
  );
}

const labelTier = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

function PayModal({ payout, partnerName, onClose, onDone }: { payout: ResellerPayout | null; partnerName: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [paidOn, setPaidOn] = useState(todayPk());
  const [ref, setRef] = useState("");
  const [cert, setCert] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!payout) return;
    setBusy(true);
    try {
      const r = await payPayout(payout.id, { rowVersion: payout.rowVersion, paidOn, paymentRef: ref, whtCertificateNo: cert || null });
      toast(`${rs0(r.netAmount)} paid to ${partnerName} · WHT ${rs0(r.whtAmount)} withheld u/s 233`, { tone: "good" });
      onDone();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not mark the payout as paid"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!payout} onClose={onClose} title="Mark as paid" subtitle={payout ? `${partnerName} · net ${rs0(payout.netAmount)} after WHT ${rs0(payout.whtAmount)}` : ""}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><Banknote />{busy ? "Saving…" : "Mark as paid"}</button></>}>
      <FormGrid>
        <Field label="Paid on" required error={errs.paidOn}><input type="date" value={paidOn} max={todayPk()} onChange={(e) => setPaidOn(e.target.value)} /></Field>
        <Field label="IBFT / cheque reference" required error={errs.paymentRef}><input value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} /></Field>
        <Field label="WHT certificate no." error={errs.whtCertificateNo} full><input value={cert} maxLength={40} onChange={(e) => setCert(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function AttributeModal({ open, partner, existing, onClose, onDone }: { open: boolean; partner: Reseller | null; existing: ResellerAttribution[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [on, setOn] = useState(todayPk());
  const [pct, setPct] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listTenants({ pageSize: 100 }).then((r) => !cancelled && setTenants(r.items.filter((t) => !["CHURNED", "PROVISIONING"].includes(t.status)))).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);
  const taken = new Set(existing.filter((a) => !a.endedOn).map((a) => a.tenantId));
  const save = async () => {
    if (!partner) return;
    setBusy(true);
    try {
      await setAttribution(partner.id, { action: "attribute", tenantId, attributedOn: on, commissionPctOverride: pct === "" ? null : pct });
      toast(`Company attributed to ${partner.name}`, { tone: "good" });
      setTenantId(""); setPct("");
      onDone();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not attribute the company"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Attribute tenant" subtitle={partner ? `${partner.name} earns ${partner.commissionPct}% of the company's MRR` : ""}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !tenantId} onClick={save}><Link2 />{busy ? "Saving…" : "Attribute"}</button></>}>
      <FormGrid>
        <Field label="Company" required error={errs.tenantId} full><select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          <option value="">Choose…</option>{tenants.filter((t) => !taken.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.displayName} · {t.code.toUpperCase()}</option>)}</select></Field>
        <Field label="Attributed on" error={errs.attributedOn}><input type="date" value={on} onChange={(e) => setOn(e.target.value)} /></Field>
        <Field label="Commission override (%)" error={errs.commissionPctOverride} hint="Blank = the partner's rate"><input type="number" min={0} max={100} step="0.5" value={pct} onChange={(e) => setPct(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

/** "Calculate payouts" for a month (template-style addition beside New reseller). */
export function CalculatePayoutsButton({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(todayPk().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await calculatePayouts(month);
      toast(`${r.created} payout${r.created === 1 ? "" : "s"} calculated for ${monthLabel(r.month)}`, { tone: r.created ? "good" : "info" });
      setOpen(false); onDone();
    } catch (e) { toast(adminErrorMessage(e, "Could not calculate payouts"), { tone: "danger" }); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}><Calculator />Calculate payouts</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Calculate payouts" subtitle="Commission on each partner's attributed MRR, less WHT 12% u/s 233"
        foot={<><button type="button" className="btn secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={run}><Calculator />{busy ? "Calculating…" : "Calculate"}</button></>}>
        <FormGrid cols={1}><Field label="Month" hint="Partners that already have this month are skipped"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Field></FormGrid>
      </Modal>
    </>
  );
}

