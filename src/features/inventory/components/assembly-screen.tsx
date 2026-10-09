"use client";

import { Boxes, Eye, PackagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AssemblyList, AssemblyVoucher, DemandOptions, StockOnHand, StockOpsOptions } from "@/shared";
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
import { stockOnHand, stockOpsOptions } from "../stock-ops-api";
import { cancelAssembly, createAssembly, deleteAssembly, demandOptions, getAssembly, listAssemblies, postAssembly, updateAssembly } from "../stock-demand-api";

type Can = { create: boolean; edit: boolean; post: boolean };
const PAGE = 10;
const STATUSES = ["DRAFT", "POSTED", "CANCELLED"];
const STATUS: Record<string, { label: string; tone: Tone }> = { DRAFT: { label: "Draft", tone: "neutral" }, POSTED: { label: "Posted", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" } };
const DIRECTION: Record<string, string> = { ASSEMBLE: "Assemble (build kits)", DISASSEMBLE: "Disassemble (break kits)" };
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fieldErrors = (e: unknown) => Object.fromEntries(Object.entries(e instanceof ApiError ? e.details ?? {} : {}).map(([k, v]) => [k, v[0] ?? ""]));

function St({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

/** No template: built in the template style. Kits are assembled from their components (or broken back into them). */
export function AssemblyScreen({ can }: { can: Can }) {
  const toast = useToast();
  const params = useSearchParams();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssemblyList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [opts, setOpts] = useState<{ ops: StockOpsOptions; demand: DemandOptions } | null>(null);
  const [openId, setOpenId] = useState<string | null>(() => params.get("asm"));
  const [editor, setEditor] = useState<{ doc: AssemblyVoucher | null } | null>(null);

  useEffect(() => {
    Promise.all([stockOpsOptions(), demandOptions()]).then(([ops, demand]) => setOpts({ ops, demand })).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listAssemblies({ status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load assembly vouchers" }));
    return () => { cancelled = true; };
  }, [status, search, page, attempt]);
  const reload = () => setAttempt((x) => x + 1);

  const counts = data?.counts ?? {};
  const all = Object.values(counts).reduce((s, x) => s + x, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const items = data?.items ?? [];
  const filtered = !!(status || search);
  const posted = items.filter((x) => x.status === "POSTED");

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <PageHead
        eyebrow="Inventory / Assembly"
        title="Assembly Vouchers"
        description="Build kits and bundles from their components, or break them back into components. Stock moves at cost."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ doc: null })} disabled={!opts}>New assembly</Button>}
      />

      <div className="kpi-grid c3 mb">
        <div className="kpi blue"><div className="kpi-top"><span>Kits defined</span><span className="icon-well"><PackagePlus /></span></div><strong>{opts ? opts.demand.kits.length : "—"}</strong><small>From Kits &amp; Bundles</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Posted (this page)</span><span className="icon-well"><Boxes /></span></div><strong>{data ? posted.length : "—"}</strong><small>{data ? `Rs ${amt(posted.reduce((s, x) => s + x.totalCost, 0))} moved` : " "}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Drafts</span><span className="icon-well"><Pencil /></span></div><strong>{counts.DRAFT ?? 0}</strong><small>Not posted yet</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head"><div><h3>Assembly register</h3><p>{data ? `${data.total} voucher${data.total === 1 ? "" : "s"}` : " "}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search ASM #…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            <button type="button" className={cn(!status && "active")} onClick={() => { setStatus(""); setPage(1); }}>All <i>{all}</i></button>
            {STATUSES.map((s) => <button key={s} type="button" className={cn(status === s && "active")} onClick={() => { setStatus(s); setPage(1); }}>{STATUS[s]!.label} <i>{counts[s] ?? 0}</i></button>)}
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 320 }} /> : !items.length ? (
          <EmptyState icon={<PackagePlus />} title={filtered ? "No vouchers match" : "No assembly vouchers yet"} description={filtered ? "Try another status or search." : "Build kits from their components to sell them as one product."}
            action={!filtered && can.create ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ doc: null })} disabled={!opts}>New assembly</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Voucher #</th><th>Date</th><th>Kit</th><th>Direction</th><th className="num">Kits</th><th>Warehouse</th><th className="num">Cost (Rs)</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td><a className="link" href={`/inventory/assembly?asm=${x.id}`} onClick={(e) => { e.preventDefault(); setOpenId(x.id); }}><Hl text={x.docNo} q={search} /></a></td>
                  <td>{dateLabel(x.docDate)}</td>
                  <td><b>{x.kit.name}</b><small>{x.kit.code}</small></td>
                  <td>{x.direction === "ASSEMBLE" ? "Assemble" : "Disassemble"}</td>
                  <td className="num">{qty(x.kitQty)}</td>
                  <td>{x.warehouse.name}</td>
                  <td className="num">{amt(x.totalCost)}</td>
                  <td><St status={x.status} /></td>
                  <td className="actions"><button type="button" className="icon-btn-sm" aria-label={`Open ${x.docNo}`} onClick={() => setOpenId(x.id)}><Eye /></button></td>
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

      <AsmDrawer key={openId ?? "none"} id={openId} can={can} onClose={() => setOpenId(null)} onEdit={(doc) => { setOpenId(null); setEditor({ doc }); }} onChanged={reload} />
      {editor && opts && <AsmEditor doc={editor.doc} opts={opts} onClose={() => setEditor(null)} onSaved={(doc, msg) => { setEditor(null); toast(msg, { tone: "good" }); setOpenId(doc.id); reload(); }} />}
    </>
  );
}

function AsmEditor({ doc, opts, onClose, onSaved }: { doc: AssemblyVoucher | null; opts: { ops: StockOpsOptions; demand: DemandOptions }; onClose: () => void; onSaved: (d: AssemblyVoucher, msg: string) => void }) {
  const [h, setH] = useState(() => ({
    kitId: doc?.kit.id ?? "", direction: doc?.direction ?? "ASSEMBLE", kitQty: doc ? String(doc.kitQty) : "1", warehouseId: doc?.warehouse.id ?? opts.ops.warehouses[0]?.id ?? "",
    docDate: doc?.docDate ?? isoDay(new Date()), remarks: doc?.remarks ?? "",
  }));
  const [stock, setStock] = useState<{ wh: string; rows: StockOnHand } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (p: Partial<typeof h>) => setH((x) => ({ ...x, ...p }));
  useEffect(() => {
    if (!h.warehouseId) return;
    let cancelled = false;
    const wh = h.warehouseId;
    stockOnHand(wh).then((rows) => !cancelled && setStock({ wh, rows })).catch(() => !cancelled && setStock({ wh, rows: [] }));
    return () => { cancelled = true; };
  }, [h.warehouseId]);
  const kit = opts.demand.kits.find((k) => k.id === h.kitId);
  const kq = Number(h.kitQty) || 0;
  const onHand = (itemId: string) => (stock?.wh === h.warehouseId ? stock.rows.filter((r) => r.itemId === itemId).reduce((s, r) => s + r.qtyOnHand, 0) : null);
  const product = (id: string) => opts.ops.products.find((p) => p.id === id);
  const lines = useMemo(() => (kit?.components ?? []).map((c) => {
    const need = c.qtyPerKit * kq;
    const have = onHand(c.itemId);
    return { ...c, need, have, cost: product(c.itemId)?.avgCost ?? 0, short: h.direction === "ASSEMBLE" && have !== null && have < need };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [kit, kq, stock, h.warehouseId, h.direction]);
  const kitHave = kit ? onHand(kit.kitItemId) : null;
  const kitShort = h.direction === "DISASSEMBLE" && kitHave !== null && kitHave < kq;
  const total = lines.reduce((s, l) => s + l.need * l.cost, 0);

  const save = async (post: boolean) => {
    setBusy(true);
    setErr(null);
    const body = { docDate: h.docDate, kitId: h.kitId, direction: h.direction, kitQty: kq, warehouseId: h.warehouseId, remarks: h.remarks || null, ...(doc && { rowVersion: doc.rowVersion }) };
    try {
      let saved = doc ? await updateAssembly(doc.id, body) : await createAssembly(body);
      let msg = `${saved.docNo} saved as draft`;
      if (post) { saved = await postAssembly(saved.id, saved.rowVersion); msg = `${saved.docNo} posted`; }
      onSaved(saved, msg);
    } catch (e) {
      setErr({ message: errMsg(e, "Could not save the voucher"), fields: fieldErrors(e) });
    } finally {
      setBusy(false);
    }
  };
  const ready = !!kit && kq > 0 && !!h.warehouseId;
  return (
    <Modal open onClose={onClose} wide title={doc ? `Edit ${doc.docNo}` : "New assembly voucher"} subtitle="Numbered on save · stock moves at average cost on posting" foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn secondary" onClick={() => save(false)} disabled={busy || !ready}>Save draft</button>
        <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy || !ready}>{busy ? "Saving…" : "Save & post"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Kit" required error={err?.fields.kitId}>
          <select value={h.kitId} onChange={(e) => set({ kitId: e.target.value })}><option value="">Choose…</option>{opts.demand.kits.map((k) => <option key={k.id} value={k.id}>{k.name} · {k.code}</option>)}</select>
        </Field>
        <Field label="Direction" required>
          <select value={h.direction} onChange={(e) => set({ direction: e.target.value })}>{Object.entries(DIRECTION).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        <Field label="Kits" required error={err?.fields.kitQty}><input type="number" min={0} step="any" value={h.kitQty} onChange={(e) => set({ kitQty: e.target.value })} /></Field>
        <Field label="Warehouse" required error={err?.fields.warehouseId}>
          <select value={h.warehouseId} onChange={(e) => set({ warehouseId: e.target.value })}>{opts.ops.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </Field>
        <Field label="Date" required><input type="date" value={h.docDate} onChange={(e) => set({ docDate: e.target.value })} /></Field>
        <Field label="Remarks"><input value={h.remarks} onChange={(e) => set({ remarks: e.target.value })} /></Field>
      </FormGrid>
      {!kit ? <div className="mt"><EmptyState icon={<PackagePlus />} title="Pick a kit" description={opts.demand.kits.length ? "Its components and quantities appear here." : "No kits yet — define one under Inventory › Kits & Bundles."} /></div> : (
        <>
          {kitShort && <Banner tone="warn" title="Not enough kits">Only {qty(kitHave ?? 0)} of {kit.name} in this warehouse.</Banner>}
          <div className="table-wrap mt"><table className="tbl lines">
            <thead><tr><th>Component</th><th className="num">Per kit</th><th className="num">{h.direction === "ASSEMBLE" ? "Consumed" : "Returned"}</th><th className="num">On hand</th><th className="num">Cost</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const p = product(l.itemId);
                return (
                  <tr key={l.itemId}>
                    <td><b>{p?.name ?? "?"}</b><small>{p?.sku}</small></td>
                    <td className="num">{qty(l.qtyPerKit)}</td>
                    <td className="num">{qty(l.need)}</td>
                    <td className="num" style={l.short ? { color: "var(--danger)" } : undefined}>{l.have === null ? "…" : qty(l.have)}{l.short && <small>short {qty(l.need - (l.have ?? 0))}</small>}</td>
                    <td className="num">{amt(l.need * l.cost)}</td>
                  </tr>
                );
              })}
              <tr className="total"><td colSpan={4}>Kit cost (estimate at average cost) · {kq ? `Rs ${amt(total / kq)} per kit` : ""}</td><td className="num">{amt(total)}</td></tr>
            </tbody>
          </table></div>
        </>
      )}
    </Modal>
  );
}

type Tab = "details" | "history";
function AsmDrawer({ id, can, onClose, onEdit, onChanged }: { id: string | null; can: Can; onClose: () => void; onEdit: (d: AssemblyVoucher) => void; onChanged: () => void }) {
  const toast = useToast();
  const [doc, setDoc] = useState<AssemblyVoucher | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"cancel" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!id) return;
    getAssembly(id).then(setDoc).catch((e: unknown) => setErr(errMsg(e, "Could not load the voucher")));
  }, [id]);
  const run = async (label: string, f: () => Promise<AssemblyVoucher | void>) => {
    setBusy(true);
    try { const r = await f(); if (r) setDoc(r); toast(label, { tone: "good" }); setAsk(null); onChanged(); } catch (e) { toast(errMsg(e, "That didn’t work"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const foot = doc ? (
    <>
      {doc.status === "DRAFT" && can.edit && <Button disabled={busy} icon={<Pencil />} onClick={() => onEdit(doc)}>Edit</Button>}
      {doc.status === "DRAFT" && can.create && <Button disabled={busy} icon={<Trash2 />} onClick={() => setAsk("delete")}>Delete</Button>}
      {doc.status === "POSTED" && can.post && <Button disabled={busy} onClick={() => setAsk("cancel")}>Cancel voucher</Button>}
      {doc.status === "DRAFT" && can.post && <Button variant="primary" disabled={busy} onClick={() => run(`${doc.docNo} posted`, () => postAssembly(doc.id, doc.rowVersion))}>Post</Button>}
    </>
  ) : undefined;
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={doc?.docNo ?? "Assembly voucher"} subtitle={doc ? `${doc.kit.name} · ${dateLabel(doc.docDate)}` : undefined} foot={foot}>
        {err ? <ErrorState message={err} /> : !doc ? <Skeleton style={{ height: 360 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><St status={doc.status} /><Badge tone="outline">{doc.direction === "ASSEMBLE" ? "Assemble" : "Disassemble"}</Badge></div>
            <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "details" && (
              <>
                <div className="dl mt">
                  <div><span>Kits</span><b>{qty(doc.kitQty)} × {doc.kit.name}</b></div>
                  <div><span>Warehouse</span><b>{doc.warehouse.name}</b></div>
                  <div><span>Kit unit cost</span><b>Rs {amt(doc.kitUnitCost)}</b></div>
                  <div><span>Journal</span><b>{doc.voucher ? <Link className="link" href={`/accounting/vouchers/${doc.voucher.id}`}>{doc.voucher.docNo}</Link> : doc.status === "POSTED" ? "No rounding difference" : "—"}</b></div>
                  {doc.remarks && <div><span>Remarks</span><b>{doc.remarks}</b></div>}
                </div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Component</th><th className="num">Per kit</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Value</th></tr></thead>
                  <tbody>
                    {doc.lines.map((l) => <tr key={l.id}><td><b>{l.item.name}</b><small>{l.item.sku}</small></td><td className="num">{qty(l.qtyPerKit)}</td><td className="num">{qty(l.qty)}</td><td className="num">{amt(l.unitCost)}</td><td className="num">{amt(l.value)}</td></tr>)}
                    <tr className="total"><td colSpan={4}>Total cost</td><td className="num">{amt(doc.totalCost)}</td></tr>
                  </tbody>
                </table></div>
              </>
            )}
            {tab === "history" && <div className="mt"><HistoryTab schema="Inventory" table="AssemblyVouchers" id={doc.id} /></div>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={ask === "delete" && !!doc} onClose={() => setAsk(null)} danger busy={busy} title={`Delete ${doc?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => doc && run(`${doc.docNo} deleted`, async () => { await deleteAssembly(doc.id, doc.rowVersion); onClose(); })}>The draft is removed.</ConfirmDialog>
      {ask === "cancel" && doc && (
        <Modal open onClose={() => setAsk(null)} title={`Cancel ${doc.docNo}`} subtitle="The stock movements and any journal are reversed." foot={
          <><button type="button" className="btn secondary" onClick={() => setAsk(null)} disabled={busy}>Back</button><button type="button" className="btn danger" disabled={busy || reason.trim().length < 3} onClick={() => run(`${doc.docNo} cancelled`, () => cancelAssembly(doc.id, doc.rowVersion, reason.trim()))}>Cancel voucher</button></>
        }>
          <FormGrid cols={1}><Field label="Reason" required><textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></FormGrid>
        </Modal>
      )}
    </>
  );
}
