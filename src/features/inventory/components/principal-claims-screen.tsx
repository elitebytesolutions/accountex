"use client";

import { BadgeCheck, Clock, Eye, FileWarning, Pencil, Plus, Search, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DemandOptions, PrincipalClaim, PrincipalClaimList, PrincipalTarget, StockOpsOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, Hl, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { stockOpsOptions } from "../stock-ops-api";
import {
  cancelPrincipalClaim, createPrincipalClaim, createPrincipalTarget, deletePrincipalClaim, deletePrincipalTarget, demandOptions, getPrincipalClaim, listPrincipalClaims,
  listPrincipalTargets, settlePrincipalClaim, submitPrincipalClaim, updatePrincipalClaim, updatePrincipalTarget,
} from "../stock-demand-api";

type Can = { edit: boolean };
type Opts = { demand: DemandOptions; ops: StockOpsOptions };
const PAGE = 10;
const STATUSES = ["PENDING", "SUBMITTED", "SETTLED", "REJECTED", "CANCELLED"];
const STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "neutral" }, SUBMITTED: { label: "Submitted", tone: "info" }, SETTLED: { label: "Settled", tone: "good" },
  REJECTED: { label: "Rejected", tone: "danger" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const TYPES: Record<string, string> = { EXPIRY: "Expiry", DAMAGE: "Damage", SCHEME: "Scheme", DISPLAY: "Display", PRICE_DIFFERENCE: "Price difference", OTHER: "Other" };
const PERIOD: Record<string, string> = { MONTH: "Month", QUARTER: "Quarter", YEAR: "Year" };
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fieldErrors = (e: unknown) => Object.fromEntries(Object.entries(e instanceof ApiError ? e.details ?? {} : {}).map(([k, v]) => [k, v[0] ?? ""]));

function St({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

type View = "claims" | "targets";
/** No template: built in the template style. Claims raised on principals (companies) and their purchase / sales targets. */
export function PrincipalClaimsScreen({ can }: { can: Can }) {
  const [view, setView] = useState<View>("claims");
  const [opts, setOpts] = useState<Opts | null>(null);
  useEffect(() => {
    Promise.all([demandOptions(), stockOpsOptions()]).then(([demand, ops]) => setOpts({ demand, ops })).catch(() => undefined);
  }, []);
  return (
    <>
      <PageHead eyebrow="Inventory / Principals" title="Principal Claims & Targets" description="Claims raised on the companies you distribute for — expiry, damage, schemes — and the purchase targets they set." />
      <div className="mb"><Tabs<View> items={[{ key: "claims", label: "Claims" }, { key: "targets", label: "Targets" }]} active={view} onChange={setView} /></div>
      {view === "claims" ? <Claims can={can} opts={opts} /> : <Targets can={can} opts={opts} />}
    </>
  );
}

// ---------------------------------------------------------------- claims
function Claims({ can, opts }: { can: Can; opts: Opts | null }) {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PrincipalClaimList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ doc: PrincipalClaim | null } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listPrincipalClaims({ status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load claims" }));
    return () => { cancelled = true; };
  }, [status, search, page, attempt]);
  const reload = () => setAttempt((x) => x + 1);
  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((s, x) => s + x, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const items = data?.items ?? [];
  const filtered = !!(status || search);

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <div className="kpi-grid c3 mb">
        <div className="kpi yellow"><div className="kpi-top"><span>Open claims</span><span className="icon-well"><Clock /></span></div><strong>{data ? data.kpis.open : "—"}</strong><small>Pending or submitted</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Open amount</span><span className="icon-well"><FileWarning /></span></div><strong>{data ? `Rs ${amt(data.kpis.openAmount)}` : "—"}</strong><small>Awaiting the principal</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Settled this year</span><span className="icon-well"><BadgeCheck /></span></div><strong>{data ? `Rs ${amt(data.kpis.settledThisYear)}` : "—"}</strong><small>Recovered</small></div>
      </div>
      <div className="panel flush">
        <div className="panel-head">
          <div><h3>Claims</h3><p>{data ? `${data.total} claim${data.total === 1 ? "" : "s"}` : " "}</p></div>
          {can.edit && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ doc: null })} disabled={!opts}>New claim</Button>}
        </div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search CLM # or description…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            <button type="button" className={cn(!status && "active")} onClick={() => { setStatus(""); setPage(1); }}>All <i>{all}</i></button>
            {STATUSES.map((s) => <button key={s} type="button" className={cn(status === s && "active")} onClick={() => { setStatus(s); setPage(1); }}>{STATUS[s]!.label} <i>{counts[s] ?? 0}</i></button>)}
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 320 }} /> : !items.length ? (
          <EmptyState icon={<FileWarning />} title={filtered ? "No claims match" : "No claims yet"} description={filtered ? "Try another status or search." : "Raise a claim when a principal owes you for expiry, damage or a scheme."}
            action={!filtered && can.edit ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ doc: null })} disabled={!opts}>New claim</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Claim #</th><th>Date</th><th>Principal</th><th>Type</th><th>Description</th><th className="num">Amount (Rs)</th><th className="num">Settled (Rs)</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td><a className="link" href="#" onClick={(e) => { e.preventDefault(); setOpenId(x.id); }}><Hl text={x.claimNo} q={search} /></a></td>
                  <td>{dateLabel(x.claimDate)}</td>
                  <td>{x.manufacturer.name}</td>
                  <td>{TYPES[x.claimType] ?? x.claimType}</td>
                  <td><Hl text={x.description} q={search} />{x.item && <small>{x.item.name}{x.qty ? ` × ${x.qty}` : ""}</small>}</td>
                  <td className="num">{amt(x.amount)}</td>
                  <td className="num">{x.settledAmount === null ? "—" : amt(x.settledAmount)}</td>
                  <td><St status={x.status} /></td>
                  <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Open ${x.claimNo}`} onClick={() => setOpenId(x.id)}><Eye /></button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {data && data.total > PAGE && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
              <button type="button" className="active">{page}</button>
              <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
            </div>
          </div>
        )}
      </div>
      <ClaimDrawer key={openId ?? "none"} id={openId} can={can} onClose={() => setOpenId(null)} onEdit={(doc) => { setOpenId(null); setEditor({ doc }); }} onChanged={reload} />
      {editor && opts && <ClaimEditor doc={editor.doc} opts={opts} onClose={() => setEditor(null)} onSaved={(doc) => { setEditor(null); toast(`${doc.claimNo} saved`, { tone: "good" }); setOpenId(doc.id); reload(); }} />}
    </>
  );
}

function ClaimEditor({ doc, opts, onClose, onSaved }: { doc: PrincipalClaim | null; opts: Opts; onClose: () => void; onSaved: (d: PrincipalClaim) => void }) {
  const [f, setF] = useState(() => ({
    manufacturerId: doc?.manufacturer.id ?? "", claimDate: doc?.claimDate ?? isoDay(new Date()), claimType: doc?.claimType ?? "EXPIRY", description: doc?.description ?? "",
    itemId: doc?.item?.id ?? "", qty: doc?.qty == null ? "" : String(doc.qty), amount: doc ? String(doc.amount) : "", remarks: doc?.remarks ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    setErr(null);
    const body = {
      manufacturerId: f.manufacturerId, claimDate: f.claimDate, claimType: f.claimType, description: f.description.trim(), itemId: f.itemId || null,
      qty: f.qty === "" ? null : Number(f.qty), amount: Number(f.amount) || 0, remarks: f.remarks || null, ...(doc && { rowVersion: doc.rowVersion }),
    };
    try {
      onSaved(doc ? await updatePrincipalClaim(doc.id, body) : await createPrincipalClaim(body));
    } catch (e) {
      setErr({ message: errMsg(e, "Could not save the claim"), fields: fieldErrors(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} wide title={doc ? `Edit ${doc.claimNo}` : "New principal claim"} subtitle="Numbered on save · editable while pending" foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || !f.manufacturerId}>{busy ? "Saving…" : "Save claim"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Principal" required error={err?.fields.manufacturerId}>
          <select value={f.manufacturerId} onChange={(e) => set({ manufacturerId: e.target.value })}><option value="">Choose…</option>{opts.demand.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Claim type" required>
          <select value={f.claimType} onChange={(e) => set({ claimType: e.target.value })}>{Object.entries(TYPES).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        <Field label="Date" required error={err?.fields.claimDate}><input type="date" value={f.claimDate} onChange={(e) => set({ claimDate: e.target.value })} /></Field>
        <Field label="Product" hint="Optional">
          <select value={f.itemId} onChange={(e) => set({ itemId: e.target.value })}><option value="">—</option>{opts.ops.products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select>
        </Field>
        <Field label="Qty" error={err?.fields.qty}><input type="number" min={0} step="any" value={f.qty} onChange={(e) => set({ qty: e.target.value })} /></Field>
        <Field label="Amount (Rs)" required error={err?.fields.amount}><input type="number" min={0} step="any" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
      </FormGrid>
      <FormGrid cols={1}>
        <Field label="Description" required error={err?.fields.description}><input value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder="e.g. 5 cartons expired in March" /></Field>
        <Field label="Remarks"><textarea rows={2} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}

type DTab = "details" | "history";
function ClaimDrawer({ id, can, onClose, onEdit, onChanged }: { id: string | null; can: Can; onClose: () => void; onEdit: (d: PrincipalClaim) => void; onChanged: () => void }) {
  const toast = useToast();
  const [doc, setDoc] = useState<PrincipalClaim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<DTab>("details");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"delete" | "cancel" | "settle" | null>(null);
  const [reason, setReason] = useState("");
  const [settle, setSettle] = useState({ date: isoDay(new Date()), amount: "", rejected: false, remarks: "" });
  useEffect(() => {
    if (!id) return;
    getPrincipalClaim(id).then((d) => { setDoc(d); setSettle((s) => ({ ...s, amount: String(d.amount) })); }).catch((e: unknown) => setErr(errMsg(e, "Could not load the claim")));
  }, [id]);
  const run = async (label: string, f: () => Promise<PrincipalClaim | void>) => {
    setBusy(true);
    try { const r = await f(); if (r) setDoc(r); toast(label, { tone: "good" }); setAsk(null); onChanged(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const open = doc && (doc.status === "PENDING" || doc.status === "SUBMITTED");
  const foot = doc && can.edit ? (
    <>
      {doc.status === "PENDING" && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(doc)}>Edit</Button>}
      {doc.status === "PENDING" && <Button disabled={busy} icon={<Trash2 />} onClick={() => setAsk("delete")}>Delete</Button>}
      {open && <Button disabled={busy} onClick={() => setAsk("cancel")}>Cancel claim</Button>}
      {doc.status === "PENDING" && <Button variant="primary" disabled={busy} onClick={() => run(`${doc.claimNo} submitted`, () => submitPrincipalClaim(doc.id, doc.rowVersion))}>Submit to principal</Button>}
      {doc.status === "SUBMITTED" && <Button variant="primary" disabled={busy} onClick={() => setAsk("settle")}>Settle…</Button>}
    </>
  ) : undefined;
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={doc?.claimNo ?? "Principal claim"} subtitle={doc ? `${doc.manufacturer.name} · ${dateLabel(doc.claimDate)}` : undefined} foot={foot}>
        {err ? <ErrorState message={err} /> : !doc ? <Skeleton style={{ height: 320 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><St status={doc.status} /><Badge tone="outline">{TYPES[doc.claimType] ?? doc.claimType}</Badge></div>
            <Tabs<DTab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <div className="dl mt">
                <div><span>Description</span><b>{doc.description}</b></div>
                {doc.item && <div><span>Product</span><b>{doc.item.name}{doc.qty ? ` × ${doc.qty}` : ""}{doc.batchNo ? ` · batch ${doc.batchNo}` : ""}</b></div>}
                <div><span>Amount claimed</span><b>Rs {amt(doc.amount)}</b></div>
                {doc.submittedAt && <div><span>Submitted</span><b>{dateLabel(doc.submittedAt)}</b></div>}
                {doc.settledDate && <div><span>{doc.status === "REJECTED" ? "Rejected on" : "Settled"}</span><b>{dateLabel(doc.settledDate)}{doc.settledAmount !== null && doc.status === "SETTLED" ? ` · Rs ${amt(doc.settledAmount)}` : ""}</b></div>}
                {doc.debitNote && <div><span>Debit note</span><b><Link className="link" href={`/purchasing/debit-notes?dn=${doc.debitNote.id}`}>{doc.debitNote.docNo}</Link></b></div>}
                {doc.remarks && <div><span>Remarks</span><b>{doc.remarks}</b></div>}
                <div><span>Raised by</span><b>{doc.createdBy?.name ?? "—"}</b></div>
              </div>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Inventory" table="PrincipalClaims" id={doc.id} /></div>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={ask === "delete" && !!doc} onClose={() => setAsk(null)} danger busy={busy} title={`Delete ${doc?.claimNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => doc && run(`${doc.claimNo} deleted`, async () => { await deletePrincipalClaim(doc.id, doc.rowVersion); onClose(); })}>The pending claim is removed.</ConfirmDialog>
      {ask === "cancel" && doc && (
        <Modal open onClose={() => setAsk(null)} title={`Cancel ${doc.claimNo}`} foot={
          <><button type="button" className="btn secondary" onClick={() => setAsk(null)} disabled={busy}>Back</button><button type="button" className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => run(`${doc.claimNo} cancelled`, () => cancelPrincipalClaim(doc.id, doc.rowVersion, reason.trim()))}>Cancel claim</button></>
        }>
          <FormGrid cols={1}><Field label="Reason" required><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></FormGrid>
        </Modal>
      )}
      {ask === "settle" && doc && (
        <Modal open onClose={() => setAsk(null)} title={`Settle ${doc.claimNo}`} subtitle={`Claimed Rs ${amt(doc.amount)}`} foot={
          <>
            <button type="button" className="btn secondary" onClick={() => setAsk(null)} disabled={busy}>Back</button>
            <button type="button" className={cn("btn", settle.rejected ? "danger" : "primary")} disabled={busy}
              onClick={() => run(settle.rejected ? `${doc.claimNo} rejected` : `${doc.claimNo} settled`, () => settlePrincipalClaim(doc.id, { rowVersion: doc.rowVersion, settledDate: settle.date, settledAmount: settle.rejected ? 0 : Number(settle.amount) || 0, rejected: settle.rejected, remarks: settle.remarks || null }))}>
              {settle.rejected ? "Mark rejected" : "Settle claim"}
            </button>
          </>
        }>
          <FormGrid cols={1}>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={settle.rejected} onChange={(e) => setSettle((s) => ({ ...s, rejected: e.target.checked }))} /> The principal rejected this claim</label>
            <Field label="Date" required><input type="date" value={settle.date} onChange={(e) => setSettle((s) => ({ ...s, date: e.target.value }))} /></Field>
            {!settle.rejected && <Field label="Amount received (Rs)" required hint="Can be less than claimed"><input type="number" min={0} step="any" value={settle.amount} onChange={(e) => setSettle((s) => ({ ...s, amount: e.target.value }))} /></Field>}
            <Field label="Remarks"><input value={settle.remarks} onChange={(e) => setSettle((s) => ({ ...s, remarks: e.target.value }))} /></Field>
          </FormGrid>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------- targets
function Targets({ can, opts }: { can: Can; opts: Opts | null }) {
  const toast = useToast();
  const [rows, setRows] = useState<PrincipalTarget[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<{ doc: PrincipalTarget | null } | null>(null);
  const [del, setDel] = useState<PrincipalTarget | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listPrincipalTargets().then((r) => { if (!cancelled) { setRows(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load targets" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = () => setAttempt((x) => x + 1);
  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await deletePrincipalTarget(del.id, del.rowVersion); toast("Target deleted", { tone: "good" }); setDel(null); reload(); } catch (e) { toast(errMsg(e, "Could not delete"), { tone: "danger" }); } finally { setBusy(false); }
  };
  if (error && !rows) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <div className="panel flush">
        <div className="panel-head">
          <div><h3>Targets</h3><p>Achievement is worked out live from posted purchases (or sales) in the period.</p></div>
          {can.edit && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ doc: null })} disabled={!opts}>New target</Button>}
        </div>
        <div style={{ padding: "0 16px" }}><Banner tone="info" title="Sales targets">Sales-based targets show 0% until the sales phases go live.</Banner></div>
        {!rows ? <Skeleton style={{ height: 240 }} /> : !rows.length ? (
          <EmptyState icon={<Target />} title="No targets yet" description="Record the purchase targets your principals set to track progress against them."
            action={can.edit ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ doc: null })} disabled={!opts}>New target</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Principal</th><th>Period</th><th>Basis</th><th className="num">Target (Rs)</th><th className="num">Achieved (Rs)</th><th style={{ width: 200 }}>Progress</th><th /></tr></thead>
            <tbody>
              {rows.map((t) => {
                const pct = Math.round(t.achievedPct);
                return (
                  <tr key={t.id}>
                    <td><b>{t.manufacturer.name}</b>{t.notes && <small>{t.notes}</small>}</td>
                    <td>{PERIOD[t.periodType] ?? t.periodType}<small>{dateLabel(t.periodStart)} – {dateLabel(t.periodEnd)}</small></td>
                    <td>{t.basis === "PURCHASE" ? "Purchases" : "Sales"}</td>
                    <td className="num">{amt(t.targetAmount)}</td>
                    <td className="num">{amt(t.achievedAmount)}</td>
                    <td>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--line)" }}><div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 3, background: pct >= 100 ? "var(--good)" : "var(--primary)" }} /></div>
                        <b style={{ minWidth: 40, textAlign: "right" }}>{pct}%</b>
                      </div>
                    </td>
                    <td className="actions">{can.edit && <>
                      <button type="button" className="icon-btn-sm" aria-label="Edit target" onClick={() => setEditor({ doc: t })}><Pencil /></button>
                      <button type="button" className="icon-btn-sm" aria-label="Delete target" onClick={() => setDel(t)}><Trash2 /></button>
                    </>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
      {editor && opts && <TargetEditor doc={editor.doc} opts={opts} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); toast("Target saved", { tone: "good" }); reload(); }} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger busy={busy} title="Delete this target?" confirmLabel="Delete" onConfirm={remove}>{del?.manufacturer.name} · {del && dateLabel(del.periodStart)} – {del && dateLabel(del.periodEnd)}</ConfirmDialog>
    </>
  );
}

/** Period end follows the period type from the start date (still editable). */
function periodEnd(start: string, type: string) {
  const d = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return start;
  const months = type === "YEAR" ? 12 : type === "QUARTER" ? 3 : 1;
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate() - 1));
  return end.toISOString().slice(0, 10);
}

function TargetEditor({ doc, opts, onClose, onSaved }: { doc: PrincipalTarget | null; opts: Opts; onClose: () => void; onSaved: () => void }) {
  const firstOfMonth = `${isoDay(new Date()).slice(0, 7)}-01`;
  const [f, setF] = useState(() => ({
    manufacturerId: doc?.manufacturer.id ?? "", periodType: doc?.periodType ?? "MONTH", periodStart: doc?.periodStart ?? firstOfMonth, periodEnd: doc?.periodEnd ?? periodEnd(firstOfMonth, "MONTH"),
    basis: doc?.basis ?? "PURCHASE", targetAmount: doc ? String(doc.targetAmount) : "", notes: doc?.notes ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    setErr(null);
    const body = { ...f, targetAmount: Number(f.targetAmount) || 0, notes: f.notes || null, ...(doc && { rowVersion: doc.rowVersion }) };
    try {
      if (doc) await updatePrincipalTarget(doc.id, body); else await createPrincipalTarget(body);
      onSaved();
    } catch (e) {
      setErr({ message: errMsg(e, "Could not save the target"), fields: fieldErrors(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={doc ? "Edit target" : "New target"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || !f.manufacturerId}>{busy ? "Saving…" : "Save target"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={1}>
        <Field label="Principal" required error={err?.fields.manufacturerId}>
          <select value={f.manufacturerId} onChange={(e) => set({ manufacturerId: e.target.value })}><option value="">Choose…</option>{opts.demand.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </Field>
        <Field label="Period" required>
          <select value={f.periodType} onChange={(e) => set({ periodType: e.target.value, periodEnd: periodEnd(f.periodStart, e.target.value) })}>{Object.entries(PERIOD).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        <Field label="From" required error={err?.fields.periodStart}><input type="date" value={f.periodStart} onChange={(e) => set({ periodStart: e.target.value, periodEnd: periodEnd(e.target.value, f.periodType) })} /></Field>
        <Field label="To" required error={err?.fields.periodEnd}><input type="date" value={f.periodEnd} onChange={(e) => set({ periodEnd: e.target.value })} /></Field>
        <Field label="Basis" required hint={f.basis === "SALES" ? "Shows 0% until the sales phases" : undefined}>
          <select value={f.basis} onChange={(e) => set({ basis: e.target.value })}><option value="PURCHASE">Purchases</option><option value="SALES">Sales</option></select>
        </Field>
        <Field label="Target (Rs)" required error={err?.fields.targetAmount}><input type="number" min={0} step="any" value={f.targetAmount} onChange={(e) => set({ targetAmount: e.target.value })} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}
