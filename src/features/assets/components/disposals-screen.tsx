"use client";

import { Banknote, Download, Landmark, PackageX, Pencil, Plus, Search, Send, Trash2, TrendingUp, Undo2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AssetDisposal, AssetDisposalList, AssetOptions, FixedAsset } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  approveDisposal, assetOptions, cancelDisposal, createDisposal, deleteDisposal, getDisposal, listAssets, listDisposals, submitDisposal, updateDisposal,
} from "../register-api";
import "./disposals-screen.css";

type Can = { create: boolean; edit: boolean; delete: boolean; post: boolean; approve: boolean };
const PAGE = 25;
const TYPES: Record<string, string> = { SALE: "Sale", SCRAPPED: "Scrapped", WRITTEN_OFF: "Written off", TRADE_IN: "Trade-in" };
const CHIPS: { key: string; label: string }[] = [{ key: "SALE", label: "Sold" }, { key: "SCRAPPED", label: "Scrapped" }, { key: "WRITTEN_OFF", label: "Written off" }, { key: "TRADE_IN", label: "Trade-in" }];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, PENDING_APPROVAL: { label: "Pending approval", tone: "warn" }, POSTED: { label: "Posted", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const DISPOSABLE = ["IN_USE", "UNDER_REPAIR", "FULLY_DEPRECIATED"];
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const n = (s: string) => (s.trim() === "" ? 0 : Number(s.replace(/,/g, "")));
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fieldErrs = (e: unknown) => (e instanceof ApiError ? Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])) : {});

function DisposalStatus({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
function GainCell({ value }: { value: number }) {
  if (Math.abs(value) < 0.005) return <td className="num zero">—</td>;
  return value > 0 ? <td className="num dr">{amt(value)}</td> : <td className="num neg">({amt(-value)})</td>;
}

/** Template app/assets/disposals (42-acc-reports.html): KPIs, type chips, disposals table, #rpt-dispose modal, detail drawer. */
export function DisposalsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssetDisposalList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<AssetOptions | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("d"));
  const [editor, setEditor] = useState<{ d: AssetDisposal | null; assetId?: string } | null>(() => {
    const a = params.get("asset");
    return a && can.create ? { d: null, assetId: a } : null;
  });

  useEffect(() => {
    assetOptions().then(setOptions).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listDisposals({ type, status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load disposals" }));
    return () => { cancelled = true; };
  }, [type, status, search, page, attempt]);
  const reload = () => setAttempt((x) => x + 1);

  const k = data?.kpis;
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((s, x) => s + x, 0);
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const filtered = !!(type || status || search);
  const tot = items.reduce((s, d) => ({ cost: s.cost + d.cost, acc: s.acc + d.accumulatedDepreciation, nbv: s.nbv + d.nbv, proceeds: s.proceeds + d.proceeds, gain: s.gain + d.gainLoss }), { cost: 0, acc: 0, nbv: 0, proceeds: 0, gain: 0 });
  const gainName = options?.accounts.find((a) => a.id === options.gainAccountId);
  const exportCsv = () => downloadCsv(`asset-disposals-${isoDay(new Date())}.csv`, [
    ["Disposal #", "Asset code", "Asset", "Category", "Date", "Type", "Buyer", "Cost", "Acc. Dep.", "NBV", "Proceeds", "GST", "Gain / (Loss)", "Status", "Journal"],
    ...items.map((d) => [d.docNo, d.asset.code, d.asset.name, d.asset.category, d.disposalDate, TYPES[d.disposalType] ?? d.disposalType, d.buyerName ?? d.customer?.name ?? "", d.cost, d.accumulatedDepreciation, d.nbv, d.proceeds, d.gstAmount, d.gainLoss, STATUS[d.status]?.label ?? d.status, d.journal?.docNo ?? ""]),
  ]);
  const setFilter = (f: () => void) => { f(); setPage(1); };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Fixed Assets / Disposals"
        title="Asset Disposals"
        description="Sales, scrapping and write-offs — with automatic gain/loss calculation and derecognition journals."
        actions={
          <>
            <Button icon={<Download />} onClick={exportCsv} disabled={!items.length}>Export</Button>
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ d: null })}>New Disposal</Button>}
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Disposals</span><span className="icon-well"><PackageX /></span></div><strong>{k ? k.count : "—"}</strong><small>{k ? `${k.posted} posted · ${k.pending} pending · ${k.draft} draft` : " "}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>NBV derecognised</span><span className="icon-well"><Landmark /></span></div><strong>{k ? rs(k.nbvDerecognised) : "—"}</strong><small>{k ? `Cost ${rs(k.costDerecognised)}` : " "}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Sale proceeds</span><span className="icon-well"><Banknote /></span></div><strong>{k ? rs(k.proceeds) : "—"}</strong><small>Posted disposals, excl. GST</small></div>
        <div className="kpi"><div className="kpi-top"><span>Net gain on disposal</span><span className="icon-well"><TrendingUp /></span></div>
          <strong>{k ? (k.netGain < 0 ? `(${rs(-k.netGain)})` : rs(k.netGain)) : "—"}</strong>
          <small className={k ? (k.netGain >= 0 ? "up" : "down") : undefined}>{k ? (k.netGain >= 0 ? `Gain${gainName ? ` · ${gainName.code} ${gainName.name}` : ""}` : "Net loss on disposal") : " "}</small>
        </div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Disposals</h3><p>Cancelled disposals are left out of the counts</p></div></div>
        <div className="toolbar mt">
          <label className="search-field"><Search /><input placeholder="Search disposals…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            <button type="button" className={cn(!type && "active")} onClick={() => setFilter(() => setType(""))}>All <i>{all}</i></button>
            {CHIPS.map((c) => <button key={c.key} type="button" className={cn(type === c.key && "active")} onClick={() => setFilter(() => setType(c.key))}>{c.label} <i>{counts[c.key] ?? 0}</i></button>)}
          </div>
          <span className="spacer" />
          <select value={status} aria-label="Status" onChange={(e) => setFilter(() => setStatus(e.target.value))}>
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([s, x]) => <option key={s} value={s}>{x.label}</option>)}
          </select>
        </div>
        {!data ? <Skeleton style={{ height: 360 }} /> : !items.length ? (
          <EmptyState icon={<PackageX />} title={filtered ? "No disposals match" : "No disposals yet"}
            description={filtered ? "Try another type, status or search." : "Record a sale, scrapping, write-off or trade-in to derecognise an asset and book the gain or loss."}
            action={!filtered && can.create ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ d: null })}>New Disposal</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Disposal #</th><th>Asset</th><th>Date</th><th>Type</th><th>Buyer</th><th className="num">Cost</th><th className="num">Acc. Dep.</th><th className="num">NBV</th><th className="num">Proceeds</th><th className="num">Gain / (Loss)</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="dsp-row" onClick={() => setOpenId(d.id)}>
                  <td><b><Hl text={d.docNo} q={search} /></b></td>
                  <td><Link className="link" href={`/assets/${d.asset.id}`} onClick={(e) => e.stopPropagation()}><Hl text={d.asset.code} q={search} /></Link><small><Hl text={d.asset.name} q={search} /> · {d.asset.category}</small></td>
                  <td>{dateLabel(d.disposalDate)}</td>
                  <td>{TYPES[d.disposalType] ?? d.disposalType}</td>
                  <td><Hl text={d.buyerName ?? d.customer?.name ?? "—"} q={search} /></td>
                  <td className="num">{amt(d.cost)}</td>
                  <td className="num">{amt(d.accumulatedDepreciation)}</td>
                  <td className="num">{amt(d.nbv)}</td>
                  {d.proceeds ? <td className="num">{amt(d.proceeds)}</td> : <td className="num zero">—</td>}
                  <GainCell value={d.gainLoss} />
                  <td><DisposalStatus status={d.status} /></td>
                </tr>
              ))}
              <tr className="total"><td colSpan={5}>Total{pages > 1 ? " (this page)" : ""}</td><td className="num">{amt(tot.cost)}</td><td className="num">{amt(tot.acc)}</td><td className="num">{amt(tot.nbv)}</td><td className="num">{amt(tot.proceeds)}</td><td className="num">{tot.gain < 0 ? `(${amt(-tot.gain)})` : amt(tot.gain)}</td><td /></tr>
            </tbody>
          </table></div>
        )}
        {data && data.total > 0 && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total} disposal{data.total === 1 ? "" : "s"}</span>
            {pages > 1 && (
              <div className="pager">
                <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
                {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
                <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
              </div>
            )}
          </div>
        )}
      </div>

      <DisposalDrawer key={openId ?? "none"} id={openId} can={can} options={options} onClose={() => setOpenId(null)} onEdit={(d) => { setOpenId(null); setEditor({ d }); }} onChanged={reload} />
      {editor && (options ? (
        <DisposeModal d={editor.d} presetAssetId={editor.assetId} options={options} onClose={() => setEditor(null)}
          onSaved={(d, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(d.id); reload(); }} />
      ) : (
        <Modal open onClose={() => setEditor(null)} title="Dispose asset"><Skeleton style={{ height: 260 }} /></Modal>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- dispose modal (#rpt-dispose)
type Form = { assetId: string; disposalType: string; disposalDate: string; buyerName: string; proceeds: string; taxCodeId: string; receiveIntoAccountId: string; remarks: string };

function DisposeModal({ d, presetAssetId, options: o, onClose, onSaved }: { d: AssetDisposal | null; presetAssetId?: string; options: AssetOptions; onClose: () => void; onSaved: (d: AssetDisposal, msg: string) => void }) {
  const [f, setF] = useState<Form>(() => ({
    assetId: d?.asset.id ?? presetAssetId ?? "", disposalType: d?.disposalType ?? "SALE", disposalDate: d?.disposalDate ?? isoDay(new Date()), buyerName: d?.buyerName ?? "",
    proceeds: d ? String(d.proceeds || "") : "", taxCodeId: d?.taxCode?.id ?? "", receiveIntoAccountId: d?.receiveIntoAccount?.id ?? o.receiveInto[0]?.accountId ?? "", remarks: d?.remarks ?? "",
  }));
  const [assets, setAssets] = useState<FixedAsset[] | null>(null);
  const [assetsErr, setAssetsErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const fe = (key: string) => err?.fields[key];

  useEffect(() => {
    let cancelled = false;
    listAssets({ pageSize: 500 })
      .then((l) => !cancelled && setAssets(l.items.filter((a) => DISPOSABLE.includes(a.status) || a.id === d?.asset.id).sort((a, b) => a.code.localeCompare(b.code))))
      .catch((e: unknown) => !cancelled && setAssetsErr(errMsg(e, "Could not load the assets")));
    return () => { cancelled = true; };
  }, [d?.asset.id]);

  const asset = assets?.find((a) => a.id === f.assetId);
  const writeOff = f.disposalType === "WRITTEN_OFF";
  const proceeds = writeOff ? 0 : n(f.proceeds);
  const tax = o.taxCodes.find((t) => t.id === f.taxCodeId);
  const gst = r2((proceeds * (tax?.rate ?? 0)) / 100);
  const cost = asset?.cost ?? d?.cost ?? 0;
  const acc = asset?.accumulatedDepreciation ?? d?.accumulatedDepreciation ?? 0;
  const nbv = asset ? asset.nbv : d?.nbv ?? 0;
  const gain = r2(proceeds - nbv);
  const glAcc = o.accounts.find((a) => a.id === (gain >= 0 ? o.gainAccountId : o.lossAccountId));
  const through = asset?.depreciatedThrough ?? null;
  const later = !!through && f.disposalDate > through && !!asset && asset.method !== "NONE" && asset.status !== "FULLY_DEPRECIATED";
  const badProceeds = Number.isNaN(proceeds) || proceeds < 0;
  const needAccount = proceeds > 0 && !f.receiveIntoAccountId;
  const ready = !!f.assetId && !!f.disposalDate && !badProceeds && !needAccount;

  const save = async (submit: boolean) => {
    setBusy(true);
    setErr(null);
    const body = {
      assetId: f.assetId, disposalType: f.disposalType, disposalDate: f.disposalDate, buyerName: f.buyerName.trim() || null, proceeds,
      taxCodeId: proceeds > 0 ? f.taxCodeId || null : null, receiveIntoAccountId: proceeds > 0 ? f.receiveIntoAccountId || null : null, remarks: f.remarks.trim() || null,
      ...(d && { rowVersion: d.rowVersion }),
    };
    let saved: AssetDisposal | null = null;
    try {
      saved = d ? await updateDisposal(d.id, body) : await createDisposal(body);
      if (!submit) return onSaved(saved, `${saved.docNo} saved as draft`);
      const sent = await submitDisposal(saved.id, saved.rowVersion);
      onSaved(sent, `Disposal ${sent.docNo} sent for approval`);
    } catch (e) {
      if (saved) onSaved(saved, `${saved.docNo} saved as draft, but not submitted: ${errMsg(e, "try again")}`);
      else setErr({ message: errMsg(e, "Could not save the disposal"), fields: fieldErrs(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={d ? `Edit ${d.docNo}` : "Dispose asset"} subtitle="Derecognise the asset and book the gain or loss on disposal." foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy || !ready}>Save draft</button>
        <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy || !ready}>{busy ? "Saving…" : "Submit for approval"}</button>
      </>
    }>
      {err && <div className="mb"><Banner tone="danger" title="Not saved">{err.message}</Banner></div>}
      {assetsErr && <div className="mb"><Banner tone="danger" title="Assets not loaded">{assetsErr}</Banner></div>}
      <FormGrid cols={3}>
        <Field label="Asset" required full error={fe("assetId")}>
          <select value={f.assetId} disabled={!assets} onChange={(e) => set({ assetId: e.target.value })}>
            <option value="">{!assets ? "Loading…" : assets.length ? "Choose…" : "No assets in use"}</option>
            {assets?.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}{a.registrationNo ? ` (${a.registrationNo})` : ""}</option>)}
            {f.assetId && assets && !asset && d && <option value={d.asset.id}>{d.asset.code} · {d.asset.name}</option>}
          </select>
        </Field>
        <Field label="Disposal type" error={fe("disposalType")}>
          <select value={f.disposalType} onChange={(e) => set({ disposalType: e.target.value, ...(e.target.value === "WRITTEN_OFF" && { proceeds: "", taxCodeId: "" }) })}>
            {Object.entries(TYPES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
          </select>
        </Field>
        <Field label="Disposal date" required error={fe("disposalDate")}><input type="date" value={f.disposalDate} onChange={(e) => set({ disposalDate: e.target.value })} /></Field>
        <Field label="Buyer" error={fe("buyerName")}><input value={f.buyerName} maxLength={150} placeholder={writeOff ? "—" : "Who bought it"} onChange={(e) => set({ buyerName: e.target.value })} /></Field>
        <Field label="Sale proceeds (Rs)" required={!writeOff} error={fe("proceeds") ?? (badProceeds ? "Enter an amount" : undefined)}>
          <input inputMode="decimal" value={writeOff ? "0.00" : f.proceeds} disabled={writeOff} placeholder="0.00" onChange={(e) => set({ proceeds: e.target.value })} />
        </Field>
        <Field label="GST on sale" error={fe("taxCodeId")}>
          <select value={f.taxCodeId} disabled={!(proceeds > 0)} onChange={(e) => set({ taxCodeId: e.target.value })}>
            <option value="">Exempt</option>
            {o.taxCodes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.rate !== null ? ` ${t.rate}%` : ""}{proceeds > 0 && t.rate ? ` — ${rs((proceeds * t.rate) / 100)}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Receive into" required={proceeds > 0} error={fe("receiveIntoAccountId") ?? (needAccount ? "Choose where the money is received" : undefined)}>
          <select value={f.receiveIntoAccountId} disabled={!(proceeds > 0)} onChange={(e) => set({ receiveIntoAccountId: e.target.value })}>
            <option value="">{o.receiveInto.length ? "Choose…" : "No bank or cash account"}</option>
            {o.receiveInto.map((r) => <option key={r.accountId} value={r.accountId}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Remarks" full error={fe("remarks")}><input value={f.remarks} maxLength={500} onChange={(e) => set({ remarks: e.target.value })} /></Field>
      </FormGrid>

      <div className="form-section"><h4>Computed result</h4><p>{through ? `Depreciation charged up to ${dateLabel(through)}; run depreciation first if the disposal is later.` : "Depreciation charged up to the last posted run; run depreciation first if the disposal is later."}</p></div>
      {!f.assetId ? <p className="small muted">Choose the asset to see the gain or loss.</p> : !asset && !d ? <Skeleton style={{ height: 160 }} /> : (
        <div className="dl">
          <div><span>Original cost</span><b>{rs(cost)}</b></div>
          <div><span>Accumulated depreciation{through ? ` to ${dateLabel(through)}` : ""}</span><b>{rs(acc)}</b></div>
          <div><span>Net book value</span><b>{rs(nbv)}</b></div>
          <div><span>Sale proceeds (excl. GST)</span><b>{rs(proceeds)}</b></div>
          {gst > 0 && <div><span>GST{tax ? ` — ${tax.name}` : ""}</span><b>{rs(gst)}</b></div>}
          <div><span>{gain >= 0 ? "Gain" : "Loss"} on disposal{glAcc ? ` → ${glAcc.code} ${glAcc.name}` : ""}</span><b className={gain >= 0 ? "dr" : "neg"}>{gain < 0 ? `(${rs(-gain)})` : rs(gain)}</b></div>
        </div>
      )}
      {later && <div className="mt"><Banner tone="warn" title="Depreciation not run up to the disposal date">The asset is depreciated through {dateLabel(through)}. Run depreciation for the months before {dateLabel(f.disposalDate)} so the gain or loss is right.</Banner></div>}
      {!glAcc && f.assetId && <div className="mt"><Banner tone="warn" title={`No ${gain >= 0 ? "gain" : "loss"} on disposal account`}>Set the FA_{gain >= 0 ? "GAIN" : "LOSS"} posting role before the disposal is approved.</Banner></div>}
    </Modal>
  );
}

// ---------------------------------------------------------------- detail drawer
type Tab = "details" | "history";

function DisposalDrawer({ id, can, options, onClose, onEdit, onChanged }: { id: string | null; can: Can; options: AssetOptions | null; onClose: () => void; onEdit: (d: AssetDisposal) => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<AssetDisposal | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const [approve, setApprove] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [n2, setN2] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getDisposal(id).then((x) => !cancelled && setD(x)).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the disposal")));
    return () => { cancelled = true; };
  }, [id, n2]);

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast(label, { tone: "good" });
      after?.();
      setN2((x) => x + 1);
      onChanged();
    } catch (e) {
      toast(errMsg(e, "That didn’t work"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const glAcc = d && options ? options.accounts.find((a) => a.id === (d.gainLoss >= 0 ? options.gainAccountId : options.lossAccountId)) : undefined;
  const actions = d ? (
    <>
      {d.status === "DRAFT" && can.delete && <Button disabled={busy} icon={<Trash2 />} onClick={() => setDel(true)}>Delete</Button>}
      {d.status === "DRAFT" && can.edit && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(d)}>Edit</Button>}
      {d.status === "DRAFT" && can.edit && <Button variant="primary" disabled={busy} icon={<Send />} onClick={() => run(`Disposal ${d.docNo} sent for approval`, () => submitDisposal(d.id, d.rowVersion))}>Submit for approval</Button>}
      {d.status === "PENDING_APPROVAL" && can.post && <Button disabled={busy} onClick={() => setCancel(true)}>Cancel</Button>}
      {d.status === "PENDING_APPROVAL" && can.approve && can.post && <Button variant="primary" disabled={busy} icon={<Send />} onClick={() => setApprove(true)}>Approve &amp; post</Button>}
      {d.status === "POSTED" && can.post && <Button disabled={busy} icon={<Undo2 />} onClick={() => setCancel(true)}>Cancel disposal</Button>}
    </>
  ) : undefined;

  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={d ? d.docNo : "Disposal"} subtitle={d ? `${d.asset.code} · ${d.asset.name} · ${dateLabel(d.disposalDate)}` : undefined} foot={actions}>
        {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN2((x) => x + 1); }} /> : !d ? <Skeleton style={{ height: 420 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><DisposalStatus status={d.status} /><Badge tone="outline">{TYPES[d.disposalType] ?? d.disposalType}</Badge></div>
            {d.status === "PENDING_APPROVAL" && <div className="mb"><Banner tone="info" title="Waiting for approval">Someone other than the preparer approves and posts the derecognition journal.</Banner></div>}
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <div className="dl mt">
                <div><span>Asset</span><b><Link className="link" href={`/assets/${d.asset.id}`}>{d.asset.code}</Link> {d.asset.name}<small className="muted"> · {d.asset.category}</small></b></div>
                <div><span>Disposal date</span><b>{dateLabel(d.disposalDate)}</b></div>
                <div><span>Buyer</span><b>{d.buyerName ?? d.customer?.name ?? "—"}</b></div>
                <div><span>Original cost</span><b>Rs {amt(d.cost)}</b></div>
                <div><span>Accumulated depreciation</span><b>Rs {amt(d.accumulatedDepreciation)}</b></div>
                <div><span>Net book value</span><b>Rs {amt(d.nbv)}</b></div>
                <div><span>Sale proceeds (excl. GST)</span><b>Rs {amt(d.proceeds)}</b></div>
                {d.gstAmount > 0 && <div><span>GST{d.taxCode ? ` — ${d.taxCode.name}` : ""}{d.gstRate ? ` ${d.gstRate}%` : ""}</span><b>Rs {amt(d.gstAmount)}</b></div>}
                <div><span>{d.gainLoss >= 0 ? "Gain" : "Loss"} on disposal{glAcc ? ` → ${glAcc.code} ${glAcc.name}` : ""}</span><b className={d.gainLoss >= 0 ? "dr" : "neg"}>{d.gainLoss < 0 ? `(Rs ${amt(-d.gainLoss)})` : `Rs ${amt(d.gainLoss)}`}</b></div>
                {d.receiveIntoAccount && <div><span>Received into</span><b>{d.receiveIntoAccount.code} {d.receiveIntoAccount.name}</b></div>}
                <div><span>Journal</span><b>{d.journal ? <Link className="link" href={`/accounting/vouchers/${d.journal.id}`}>{d.journal.docNo}</Link> : d.status === "CANCELLED" ? "—" : "On approval"}</b></div>
                <div><span>Prepared by</span><b>{d.createdBy?.name ?? "—"}<small className="muted"> · {dateLabel(d.createdAt)}</small></b></div>
                {d.submittedAt && <div><span>Submitted</span><b>{dateLabel(d.submittedAt)}</b></div>}
                {d.approvedBy && <div><span>Approved by</span><b>{d.approvedBy.name}{d.approvedAt && <small className="muted"> · {dateLabel(d.approvedAt)}</small>}</b></div>}
                {d.remarks && <div><span>Remarks</span><b>{d.remarks}</b></div>}
              </div>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="FixedAssets" table="AssetDisposals" id={d.id} /></div>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={del && !!d} onClose={() => setDel(false)} danger busy={busy} title={`Delete ${d?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => d && run(`${d.docNo} deleted`, () => deleteDisposal(d.id, d.rowVersion), () => { setDel(false); onClose(); })}>
        The draft is removed and the asset stays in use. Its number is not reused.
      </ConfirmDialog>
      <ConfirmDialog open={approve && !!d} onClose={() => setApprove(false)} busy={busy} title={`Approve and post ${d?.docNo ?? ""}?`} confirmLabel="Approve & post"
        onConfirm={() => d && run(`${d.docNo} approved and posted`, () => approveDisposal(d.id), () => setApprove(false))}>
        {d ? `The asset is derecognised and the ${d.gainLoss >= 0 ? "gain" : "loss"} of Rs ${amt(Math.abs(d.gainLoss))} is posted. You can't approve a disposal you prepared.` : ""}
      </ConfirmDialog>
      {d && cancel && <CancelModal d={d} onClose={() => setCancel(false)} onDone={(x) => { setCancel(false); toast(`${x.docNo} cancelled${d.status === "POSTED" ? " — journal reversed" : ""}`, { tone: "good" }); setN2((v) => v + 1); onChanged(); }} />}
    </>
  );
}

function CancelModal({ d, onClose, onDone }: { d: AssetDisposal; onClose: () => void; onDone: (d: AssetDisposal) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try { onDone(await cancelDisposal(d.id, d.rowVersion, reason.trim())); } catch (e) { setErr(errMsg(e, "Could not cancel the disposal")); } finally { setBusy(false); }
  };
  const posted = d.status === "POSTED";
  return (
    <Modal open onClose={onClose} title={`Cancel ${d.docNo}`} subtitle={posted ? "The derecognition journal is reversed and the asset goes back into use." : "The disposal is withdrawn; the asset stays in use."} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="btn danger" onClick={go} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : posted ? "Reverse & cancel" : "Cancel disposal"}</button>
      </>
    }>
      <FormGrid cols={1}>
        <Field label="Reason" required error={err ?? undefined}><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this disposal cancelled?" /></Field>
      </FormGrid>
    </Modal>
  );
}
