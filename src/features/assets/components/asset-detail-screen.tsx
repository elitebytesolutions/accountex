"use client";

import { ArrowLeftRight, Boxes, Check as CheckIcon, Download, History, PackageX, Pencil, Printer, Stamp, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AssetDetail, AssetOptions, AssetTransfer } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { Money, dateLabel, downloadCsv, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { approveTransfer, assetOptions, cancelTransfer, getAsset, rejectTransfer, requestTransfer } from "../register-api";
import { AssetFormModal, AssetStatus, CapitaliseModal, METHOD_LABEL, categoryIcon, isActiveAsset, methodShort } from "./asset-form";
import "./asset-detail-screen.css";

type Can = { create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (n: number) => (Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : Math.abs(n) >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : Math.round(n).toLocaleString("en-US"));
const gl = (g: { code: string; name: string } | null) => (g ? `${g.code} ${g.name}` : "—");
const daysUntil = (iso: string) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date(`${isoDay(new Date())}T00:00:00`).getTime()) / 86_400_000);

const SCHEDULE_STATUS: Record<string, { label: string; tone: Tone }> = { LOCKED: { label: "Locked", tone: "neutral" }, PENDING: { label: "Pending", tone: "warn" }, PROJECTED: { label: "Projected", tone: "info" } };
const TRANSFER_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING_APPROVAL: { label: "Pending approval", tone: "warn" }, APPROVED: { label: "Approved", tone: "good" }, COMPLETED: { label: "Completed", tone: "good" },
  REJECTED: { label: "Rejected", tone: "danger" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const TL_TONE: Record<string, string> = { POSTED: "good", COMPLETED: "good", APPROVED: "good", PENDING_APPROVAL: "warn", DRAFT: "warn", REJECTED: "danger", CANCELLED: "danger", REVERSED: "danger" };
const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

/** Fixed Assets › Asset Detail (template app/assets/view, 42-acc-reports.html). */
export function AssetDetailScreen({ id, can }: { id: string; can: Can }) {
  const toast = useToast();
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [options, setOptions] = useState<AssetOptions | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; notFound?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [capitalising, setCapitalising] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [declining, setDeclining] = useState<{ t: AssetTransfer; kind: "reject" | "cancel" } | null>(null);
  const [chart, setChart] = useState<"nbv" | "dep">("nbv");
  const [historyView, setHistoryView] = useState<"activity" | "log">("activity");
  const [busy, setBusy] = useState<string | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    getAsset(id)
      .then((a) => { if (!cancelled) { setAsset(a); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, notFound: e.status === 404 } : { message: "Could not load the asset" }));
    return () => { cancelled = true; };
  }, [id, attempt]);
  useEffect(() => {
    let cancelled = false;
    assetOptions().then((o) => !cancelled && setOptions(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  if (error?.notFound) {
    return <EmptyState icon={<Boxes />} title="Asset not found" description="It may have been deleted, or the link is wrong." action={<ButtonLink href="/assets">Back to register</ButtonLink>} />;
  }
  if (error && !asset) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const a = asset;
  const head = (
    <PageHead
      eyebrow={<>Fixed Assets / <Link className="link" href="/assets">Register</Link> / {a?.code ?? "…"}</>}
      title="Asset Detail"
      description="Lifecycle, depreciation schedule and history for a single asset."
      actions={a && (
        <>
          <Button icon={<Printer />} onClick={() => printTag(a)}>Print tag</Button>
          {can.edit && isActiveAsset(a.status) && <Button icon={<ArrowLeftRight />} disabled={a.transfers.some((t) => t.status === "PENDING_APPROVAL")} title={a.transfers.some((t) => t.status === "PENDING_APPROVAL") ? "A transfer is already awaiting approval" : undefined} onClick={() => setTransferring(true)}>Transfer</Button>}
          {can.create && isActiveAsset(a.status) && !a.disposal && <ButtonLink variant="danger" href={`/assets/disposals?asset=${a.id}`} icon={<PackageX />}>Dispose</ButtonLink>}
          {can.post && a.status === "NEW" && <Button variant="lime" icon={<Stamp />} onClick={() => setCapitalising(true)}>Capitalise</Button>}
          {can.edit && a.status !== "DISPOSED" && <Button variant="primary" icon={<Pencil />} onClick={() => setEditing(true)}>Edit</Button>}
        </>
      )}
    />
  );
  if (!a) return <>{head}<Skeleton style={{ height: 120, marginBottom: 18 }} /><Skeleton style={{ height: 320 }} /></>;

  const { icon: CatIcon } = categoryIcon(a.category.name);
  const pctOfCost = a.cost > 0 ? (a.nbv / a.cost) * 100 : 0;
  const insDays = a.insuranceExpiry ? daysUntil(a.insuranceExpiry) : null;
  const pendingRow = a.schedule.find((r) => r.status === "PENDING");

  const transferAct = async (t: AssetTransfer, kind: "approve" | "reject" | "cancel", reason?: string) => {
    setBusy(t.id);
    try {
      if (kind === "approve") await approveTransfer(t.id);
      else if (kind === "reject") await rejectTransfer(t.id, reason || undefined);
      else await cancelTransfer(t.id, reason || undefined);
      toast(kind === "approve" ? `Transfer to ${t.toBranch.name} approved` : `Transfer ${kind === "reject" ? "rejected" : "cancelled"}`, { tone: kind === "approve" ? "good" : "warn" });
      setDeclining(null);
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update the transfer"), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  // Activity timeline built from the asset's own records (newest first).
  const timeline: { tone?: string; title: string; sub: string }[] = [];
  if (a.disposal) timeline.push({ tone: TL_TONE[a.disposal.status] ?? "danger", title: `Disposal ${a.disposal.docNo} · ${titleCase(a.disposal.status)}`, sub: dateLabel(a.disposal.disposalDate) });
  for (const t of [...a.transfers].sort((x, y) => y.effectiveDate.localeCompare(x.effectiveDate))) {
    const cust = t.fromCustodian?.name !== t.toCustodian?.name ? `Custodian ${t.fromCustodian?.name ?? "none"} → ${t.toCustodian?.name ?? "none"} · ` : "";
    timeline.push({ tone: TL_TONE[t.status], title: `Transfer ${t.fromBranch.name} → ${t.toBranch.name} · ${TRANSFER_STATUS[t.status]?.label ?? titleCase(t.status)}`, sub: `${cust}${dateLabel(t.effectiveDate)}` });
  }
  for (const r of a.runs) timeline.push({ tone: TL_TONE[r.status], title: `${r.period} depreciation ${r.status.toLowerCase().replace(/_/g, " ")}`, sub: `Rs ${Math.round(r.charge).toLocaleString("en-US")} · ${r.docNo}` });
  if (a.status !== "NEW") timeline.push({ tone: "good", title: "Capitalised", sub: `${[a.capitalisedBy?.name, a.source.docNo && `from ${a.source.docNo}`].filter(Boolean).join(" · ") || "—"} · acquired ${dateLabel(a.acquisitionDate)}` });
  timeline.push({ title: "Added to the register", sub: dateLabel(a.createdAt) });

  const exportSchedule = () => {
    downloadCsv(`${a.code}-depreciation-schedule.csv`, [
      ["Fiscal year", "Opening NBV", "Months posted", "Months", "Depreciation", "Accumulated", "Closing NBV", "Status"],
      ...a.schedule.map((r) => [r.fiscalYear, r.openingNbv, r.monthsPosted, r.months, r.depreciation, r.accumulated, r.closingNbv, SCHEDULE_STATUS[r.status]?.label ?? r.status]),
    ]);
    toast("Exported to Excel (CSV)", { tone: "good" });
  };

  return (
    <>
      {head}
      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}

      <div className="panel mb">
        <div className="profile-head">
          <span className="avatar xl"><CatIcon /></span>
          <div>
            <h2>{a.name}{a.registrationNo && ` — ${a.registrationNo}`}</h2>
            <p className="muted">{[a.code, a.category.name, a.branch.name, a.custodian && `Custodian: ${a.custodian.name}`].filter(Boolean).join(" · ")}</p>
            <div className="row">
              <AssetStatus status={a.status} />
              <Badge tone={a.method === "NONE" ? "neutral" : "info"}>{methodShort(a.method, a.ratePct)}</Badge>
              {a.insuranceExpiry && insDays !== null && (
                <Badge tone={insDays < 0 ? "danger" : insDays <= 30 ? "warn" : "neutral"}>{insDays < 0 ? "Insurance expired" : "Insured"}{a.insurer && ` — ${a.insurer}`} {insDays < 0 ? dateLabel(a.insuranceExpiry) : `till ${dateLabel(a.insuranceExpiry)}`}</Badge>
              )}
              {a.tagNo && <Badge tone="violet">Tag {a.tagNo}</Badge>}
            </div>
          </div>
          <div className="head-actions">
            <div className="kpi" style={{ minWidth: 200 }}><div className="kpi-top"><span>Net Book Value</span></div><strong><Money value={a.nbv} dec={0} /></strong><small>{pctOfCost.toFixed(1)}% of cost</small></div>
          </div>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <div><h3>{chart === "nbv" ? "Net book value" : "Depreciation"}</h3><p>{a.schedule.length ? `Actual${pendingRow ? ` to ${pendingRow.fiscalYear}` : ""}, projected thereafter` : "No schedule yet"}</p></div>
              <div className="panel-actions"><div className="seg">
                <button type="button" className={cn(chart === "nbv" && "active")} onClick={() => setChart("nbv")}>NBV</button>
                <button type="button" className={cn(chart === "dep" && "active")} onClick={() => setChart("dep")}>Depreciation</button>
              </div></div>
            </div>
            <NbvChart asset={a} mode={chart} />
          </div>

          <div className="panel flush">
            <div className="panel-head">
              <div><h3>Depreciation schedule</h3><p>{a.method === "NONE" ? "Not depreciated" : `${METHOD_LABEL[a.method]?.split(" — ")[1] ?? a.method} @ ${a.ratePct ?? 0}% p.a. · ${a.chargeFullMonthOnPurchase ? "full month in month of purchase" : "monthly proration"}`}</p></div>
              <div className="panel-actions"><Button variant="ghost" size="sm" icon={<Download />} onClick={exportSchedule} disabled={!a.schedule.length}>Excel</Button></div>
            </div>
            {!a.schedule.length ? (
              <EmptyState icon={<History />} title={a.status === "NEW" ? "Not capitalised yet" : "No depreciation"} description={a.status === "NEW" ? "Capitalise the asset to start its depreciation schedule." : "This asset is not depreciated."} />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Fiscal year</th><th className="num">Opening NBV</th><th className="num">Months</th><th className="num">Depreciation</th><th className="num">Accumulated</th><th className="num">Closing NBV</th><th>Status</th></tr></thead>
                  <tbody>
                    {a.schedule.map((r, i) => {
                      const muted = r.status === "PROJECTED";
                      const s = SCHEDULE_STATUS[r.status]!;
                      return (
                        <tr key={`${r.fiscalYear}-${i}`}>
                          <td className={cn(muted && "muted")}>{r.status === "PENDING" ? <><b>{r.fiscalYear}</b><small>{r.monthsPosted} of {r.months} months posted</small></> : r.fiscalYear}</td>
                          <td className={cn("num", muted && "muted")}>{amt(r.openingNbv)}</td>
                          <td className={cn("num", muted && "muted")}>{r.status === "PENDING" ? `${r.monthsPosted} / ${r.months}` : r.months}</td>
                          <td className={cn("num", muted && "muted")}>{amt(r.depreciation)}</td>
                          <td className={cn("num", muted && "muted")}>{amt(r.accumulated)}</td>
                          <td className={cn("num", muted && "muted")}>{amt(r.closingNbv)}</td>
                          <td><Badge tone={s.tone}>{s.label}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel flush">
            <div className="panel-head"><div><h3>Transfers</h3><p>{a.transfers.length ? `${a.transfers.length} ${a.transfers.length === 1 ? "request" : "requests"}` : "Location and custodian changes"}</p></div></div>
            {!a.transfers.length ? (
              <EmptyState icon={<ArrowLeftRight />} title="No transfers" description="Moving the asset to another branch or custodian needs approval." />
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Effective</th><th>From → To</th><th>Custodian</th><th>Reason</th><th>Requested by</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {a.transfers.map((t) => {
                      const s = TRANSFER_STATUS[t.status] ?? { label: titleCase(t.status), tone: "neutral" as Tone };
                      const pending = t.status === "PENDING_APPROVAL";
                      return (
                        <tr key={t.id}>
                          <td>{dateLabel(t.effectiveDate)}</td>
                          <td>{t.fromBranch.name} → <b>{t.toBranch.name}</b></td>
                          <td>{t.fromCustodian?.name ?? "—"} → {t.toCustodian?.name ?? "—"}</td>
                          <td>{t.reason ?? <span className="muted">—</span>}</td>
                          <td>{t.requestedBy?.name ?? "—"}<small>{dateLabel(t.createdAt)}</small></td>
                          <td><Badge tone={s.tone} dot>{s.label}</Badge>{t.approvedBy && <small>{t.approvedBy.name}</small>}</td>
                          <td className="actions">
                            {pending && (
                              <span className="row fa-tr-actions">
                                {can.approve && <Button size="sm" variant="primary" icon={<CheckIcon />} disabled={busy === t.id} onClick={() => transferAct(t, "approve")}>Approve</Button>}
                                {can.approve && <Button size="sm" disabled={busy === t.id} onClick={() => setDeclining({ t, kind: "reject" })}>Reject</Button>}
                                {can.edit && <Button size="sm" variant="ghost" icon={<X />} disabled={busy === t.id} onClick={() => setDeclining({ t, kind: "cancel" })}>Cancel</Button>}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Asset details</h3></div></div>
            <div className="dl">
              <div><span>Acquired</span><b>{dateLabel(a.acquisitionDate)}</b></div>
              <div><span>Source</span><b>{a.source.type === "BILL" && a.source.id ? <Link className="link" href={`/purchases/bills/${a.source.id}`}>{a.source.docNo}</Link> : a.status === "NEW" ? "Not capitalised" : a.source.docNo ?? "Existing asset"}</b></div>
              <div><span>Supplier</span><b>{a.vendor?.name ?? "—"}</b></div>
              <div><span>Cost</span><b><Money value={a.cost} dec={0} /></b></div>
              <div><span>Accumulated dep.</span><b><Money value={a.accumulatedDepreciation} dec={0} /></b></div>
              <div><span>Residual value</span><b><Money value={a.residualValue} dec={0} /></b></div>
              <div><span>Monthly charge</span><b><Money value={a.monthlyCharge} dec={0} /></b></div>
              {a.depreciatedThrough && <div><span>Depreciated through</span><b>{dateLabel(a.depreciatedThrough)}</b></div>}
              {(a.engineNo || a.chassisNo) && <div><span>Engine / Chassis</span><b>{a.engineNo ?? "—"} / {a.chassisNo ?? "—"}</b></div>}
              {a.serialNo && <div><span>Serial no</span><b>{a.serialNo}</b></div>}
              {a.insurancePolicyNo && <div><span>Insurance policy</span><b>{a.insurancePolicyNo}</b></div>}
              <div><span>Asset GL</span><b>{gl(a.costAccount)}</b></div>
              <div><span>Accum. GL</span><b>{gl(a.accumDepAccount)}</b></div>
              <div><span>Expense GL</span><b>{gl(a.depExpenseAccount)}</b></div>
              <div><span>Cost centre</span><b>{a.costCentre?.name ?? "—"}</b></div>
              {a.disposedOn && <div><span>Disposed on</span><b>{dateLabel(a.disposedOn)}</b></div>}
            </div>
          </div>
          <div className="panel fa-history">
            <div className="panel-head">
              <div><h3>History</h3><p>{historyView === "activity" ? "Transfers & depreciation" : "Every change to the record"}</p></div>
              <div className="panel-actions"><div className="seg">
                <button type="button" className={cn(historyView === "activity" && "active")} onClick={() => setHistoryView("activity")}>Activity</button>
                <button type="button" className={cn(historyView === "log" && "active")} onClick={() => setHistoryView("log")}>Change log</button>
              </div></div>
            </div>
            {historyView === "log" ? <HistoryTab schema="FixedAssets" table="FixedAssets" id={a.id} /> : (
              <div className="timeline">
                {timeline.map((x, i) => <div className="tl-item" key={i}><span className={cn("tl-dot", x.tone)} /><div><b>{x.title}</b><small>{x.sub}</small></div></div>)}
              </div>
            )}
          </div>
        </div>
      </div>

      <AssetFormModal open={editing} asset={a} options={options} canPost={can.post} onClose={() => setEditing(false)}
        onSaved={(_, capitalise) => { setEditing(false); reload(); if (capitalise) setCapitalising(true); }} />
      <CapitaliseModal asset={capitalising ? a : null} onClose={() => setCapitalising(false)} onDone={() => { setCapitalising(false); reload(); }} />
      <TransferModal open={transferring} asset={a} options={options} onClose={() => setTransferring(false)} onDone={() => { setTransferring(false); reload(); }} />
      <DeclineModal state={declining} busy={!!busy} onClose={() => setDeclining(null)} onConfirm={(reason) => declining && transferAct(declining.t, declining.kind, reason)} />
    </>
  );
}

/** Template NBV chart: area + solid line for actual (locked / pending) years, dashed line for projected years. */
function NbvChart({ asset, mode }: { asset: AssetDetail; mode: "nbv" | "dep" }) {
  const rows = asset.schedule;
  if (!rows.length) return <EmptyState icon={<History />} title="Nothing to chart yet" description={asset.status === "NEW" ? "The chart fills in once the asset is capitalised." : "This asset is not depreciated."} />;
  const pts = mode === "nbv"
    ? [{ label: dateLabel(asset.acquisitionDate).slice(3), value: rows[0]!.openingNbv, projected: false }, ...rows.map((r) => ({ label: r.fiscalYear, value: r.closingNbv, projected: r.status === "PROJECTED" }))]
    : rows.map((r) => ({ label: r.fiscalYear, value: r.depreciation, projected: r.status === "PROJECTED" }));
  const max = Math.max(...pts.map((p) => p.value), 1);
  const x = (i: number) => (pts.length === 1 ? 295 : 20 + (i * 550) / (pts.length - 1));
  const y = (v: number) => 190 - (v / max) * 172;
  const xy = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`);
  const lastActual = pts.reduce((n, p, i) => (p.projected ? n : i), 0);
  const actual = xy.slice(0, lastActual + 1);
  const projected = xy.slice(lastActual);
  // Thin out the labels on long schedules.
  const step = Math.ceil(pts.length / 7);
  return (
    <>
      <svg className="chart" viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label={mode === "nbv" ? "Net book value by year" : "Depreciation by year"}>
        <defs>
          <linearGradient id="faArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--primary)", stopOpacity: 0.26 }} /><stop offset="1" style={{ stopColor: "var(--primary)", stopOpacity: 0 }} /></linearGradient>
        </defs>
        <path className="area" style={{ fill: "url(#faArea)" }} d={`M${xy.join(" L")} L${x(pts.length - 1).toFixed(1)},200 L${x(0).toFixed(1)},200 Z`} />
        {actual.length > 1 && <path className="line" d={`M${actual.join(" L")}`} />}
        {projected.length > 1 && <path className="line blue" d={`M${projected.join(" L")}`} strokeDasharray="6 5" />}
        {pts.length === 1 && <circle cx={x(0)} cy={y(pts[0]!.value)} r={4} />}
      </svg>
      <div className="row small muted fa-chart-labels">
        {pts.map((p, i) => (i % step === 0 || i === pts.length - 1) && <span key={i}>{p.label}<br /><b>{short(p.value)}</b></span>)}
      </div>
      <div className="legend"><span><i style={{ background: "var(--primary)" }} />Actual {mode === "nbv" ? "NBV" : "depreciation"}</span><span><i style={{ background: "var(--blue)" }} />Projected {mode === "nbv" ? "NBV" : "depreciation"}</span></div>
    </>
  );
}

/** Template `#rpt-asset-transfer`: request a branch / custodian move (approved by someone with fa:approve). */
function TransferModal({ open, asset, options, onClose, onDone }: { open: boolean; asset: AssetDetail; options: AssetOptions | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ toBranchId: "", toCustodianEmployeeId: "", effectiveDate: isoDay(new Date()), reason: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setForm({ toBranchId: "", toCustodianEmployeeId: "", effectiveDate: isoDay(new Date()), reason: "" }); setErrs({}); }
  }
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    const local: Record<string, string> = {};
    if (!form.toBranchId) local.toBranchId = "Choose the new location";
    if (!form.effectiveDate) local.effectiveDate = "Enter the effective date";
    if (Object.keys(local).length) { setErrs(local); return; }
    setBusy(true);
    setErrs({});
    try {
      await requestTransfer(asset.id, { toBranchId: form.toBranchId, toCustodianEmployeeId: form.toCustodianEmployeeId || null, effectiveDate: form.effectiveDate, reason: form.reason || null });
      toast("Transfer request sent for approval", { tone: "good" });
      onDone();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not request the transfer"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Transfer asset" subtitle={`${asset.code} · ${asset.name}`} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={submit} disabled={busy || !options}>{busy ? "Submitting…" : "Submit transfer"}</button>
      </>
    }>
      <FormGrid>
        <Field label="From location"><input value={asset.branch.name} readOnly /></Field>
        <Field label="To location" required error={errs.toBranchId}>
          <select value={form.toBranchId} onChange={(e) => set("toBranchId", e.target.value)}>
            <option value="">Choose…</option>
            {options?.branches.filter((b) => b.id !== asset.branch.id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
        <Field label="New custodian" error={errs.toCustodianEmployeeId} hint={asset.custodian ? `Now: ${asset.custodian.name}` : undefined}>
          <select value={form.toCustodianEmployeeId} onChange={(e) => set("toCustodianEmployeeId", e.target.value)}>
            <option value="">None</option>
            {options?.employees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Effective date" required error={errs.effectiveDate}><input type="date" value={form.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} /></Field>
        <Field label="Reason" full error={errs.reason}><textarea rows={2} value={form.reason} placeholder="e.g. Islamabad branch distribution route expansion" onChange={(e) => set("reason", e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

function DeclineModal({ state, busy, onClose, onConfirm }: { state: { t: AssetTransfer; kind: "reject" | "cancel" } | null; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [prev, setPrev] = useState(state);
  if (state !== prev) { setPrev(state); setReason(""); }
  const reject = state?.kind === "reject";
  return (
    <Modal open={!!state} onClose={() => !busy && onClose()} title={reject ? "Reject transfer" : "Cancel transfer"} subtitle={state ? `${state.t.fromBranch.name} → ${state.t.toBranch.name} · ${dateLabel(state.t.effectiveDate)}` : undefined} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="btn danger solid" onClick={() => onConfirm(reason.trim())} disabled={busy}>{busy ? "Working…" : reject ? "Reject transfer" : "Cancel transfer"}</button>
      </>
    }>
      <FormGrid cols={1}>
        <Field label="Reason" hint="Optional; recorded on the transfer"><textarea rows={2} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} /></Field>
      </FormGrid>
    </Modal>
  );
}

/** Prints a small asset tag (code, name, tag no, category, location) in its own window. */
function printTag(a: AssetDetail) {
  const w = window.open("", "_blank", "width=420,height=300");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><title>${esc(a.code)}</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:16px}.tag{border:2px solid #111;border-radius:10px;padding:14px 16px;width:300px}.code{font:700 22px/1.1 ui-monospace,monospace;letter-spacing:.06em}.name{font-size:13px;margin:6px 0 8px}.meta{font-size:11px;color:#444}</style>
<div class="tag"><div class="code">${esc(a.tagNo ?? a.code)}</div><div class="name">${esc(a.name)}</div><div class="meta">${esc([a.code, a.category.name, a.branch.name].join(" · "))}<br>Acquired ${esc(dateLabel(a.acquisitionDate))}</div></div>`);
  w.document.close();
  w.focus();
  w.print();
}
