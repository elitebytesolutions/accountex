"use client";

import { Eye, Percent, Plus, RotateCcw, Search, Tags, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BulkPriceUpdate, BulkPriceUpdateList, DemandOptions, StockOpsOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, downloadCsv, Hl } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import { stockOpsOptions } from "../stock-ops-api";
import { applyPriceUpdate, createPriceUpdate, deletePriceUpdate, demandOptions, getPriceUpdate, listPriceUpdates, undoPriceUpdate } from "../stock-demand-api";

type Can = { edit: boolean };
type Opts = { demand: DemandOptions; ops: StockOpsOptions };
const PAGE = 10;
const STATUSES = ["DRAFT", "APPLIED", "UNDONE"];
const STATUS: Record<string, { label: string; tone: Tone }> = { DRAFT: { label: "Draft", tone: "neutral" }, APPLIED: { label: "Applied", tone: "good" }, UNDONE: { label: "Undone", tone: "warn" } };
const FIELD: Record<string, string> = { PRICE: "Retail price", WPRICE: "Wholesale price", COST: "Cost", BOTH: "Retail + wholesale" };
const APPLY: Record<string, string> = { COMPANY: "By company", CLASS: "By product class", SELECTED: "Selected products" };
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctLabel = (n: number) => `${n > 0 ? "+" : ""}${n}%`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const fieldErrors = (e: unknown) => Object.fromEntries(Object.entries(e instanceof ApiError ? e.details ?? {} : {}).map(([k, v]) => [k, v[0] ?? ""]));

function St({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
const scope = (x: Omit<BulkPriceUpdate, "lines">) => x.applyTo === "COMPANY" ? x.manufacturer?.name ?? "Company" : x.applyTo === "CLASS" ? x.productClass?.name ?? "Class" : "Selected products";

/** No template: built in the template style. A % change on a set of products: preview (draft) → apply → undo. */
export function PriceUpdatesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BulkPriceUpdateList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [opts, setOpts] = useState<Opts | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    Promise.all([demandOptions(), stockOpsOptions()]).then(([demand, ops]) => setOpts({ demand, ops })).catch(() => undefined);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    listPriceUpdates({ status, search, page, pageSize: PAGE })
      .then((l) => { if (!cancelled) { setData(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load price updates" }));
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
      <PageHead
        eyebrow="Inventory / Pricing"
        title="Bulk Price Updates"
        description="Raise or lower prices by a percentage across a company, a product class or picked products. Preview first, apply, and undo if needed."
        actions={can.edit && <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)} disabled={!opts}>New price update</Button>}
      />
      <div className="kpi-grid c3 mb">
        <div className="kpi yellow"><div className="kpi-top"><span>Drafts</span><span className="icon-well"><Eye /></span></div><strong>{counts.DRAFT ?? 0}</strong><small>Previewed, not applied</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Applied</span><span className="icon-well"><Tags /></span></div><strong>{counts.APPLIED ?? 0}</strong><small>Live on products</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Undone</span><span className="icon-well"><RotateCcw /></span></div><strong>{counts.UNDONE ?? 0}</strong><small>Prices restored</small></div>
      </div>
      <div className="panel flush">
        <div className="panel-head"><div><h3>Price updates</h3><p>{data ? `${data.total} batch${data.total === 1 ? "" : "es"}` : " "}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search PCB #…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            <button type="button" className={cn(!status && "active")} onClick={() => { setStatus(""); setPage(1); }}>All <i>{all}</i></button>
            {STATUSES.map((s) => <button key={s} type="button" className={cn(status === s && "active")} onClick={() => { setStatus(s); setPage(1); }}>{STATUS[s]!.label} <i>{counts[s] ?? 0}</i></button>)}
          </div>
        </div>
        {!data ? <Skeleton style={{ height: 320 }} /> : !items.length ? (
          <EmptyState icon={<Percent />} title={filtered ? "No price updates match" : "No price updates yet"} description={filtered ? "Try another status or search." : "Preview a % change on a set of products, then apply it."}
            action={!filtered && can.edit ? <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)} disabled={!opts}>New price update</Button> : undefined} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Batch #</th><th>Created</th><th>Applies to</th><th>Field</th><th className="num">Change</th><th className="num">Products</th><th>Applied</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td><a className="link" href="#" onClick={(e) => { e.preventDefault(); setOpenId(x.id); }}><Hl text={x.docNo} q={search} /></a></td>
                  <td>{dateLabel(x.createdAt)}</td>
                  <td>{scope(x)}<small>{APPLY[x.applyTo]}</small></td>
                  <td>{FIELD[x.priceField] ?? x.priceField}</td>
                  <td className="num" style={{ color: x.changePct < 0 ? "var(--danger)" : undefined }}>{pctLabel(x.changePct)}</td>
                  <td className="num">{x.itemCount}</td>
                  <td>{x.appliedAt ? <>{dateLabel(x.appliedAt)}<small>{x.appliedBy?.name}</small></> : "—"}</td>
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
      <PuDrawer key={openId ?? "none"} id={openId} can={can} onClose={() => setOpenId(null)} onChanged={reload} />
      {creating && opts && <PuEditor opts={opts} onClose={() => setCreating(false)} onSaved={(doc) => { setCreating(false); toast(`${doc.docNo} previewed — check the new prices, then apply`, { tone: "good" }); setOpenId(doc.id); reload(); }} />}
    </>
  );
}

function PuEditor({ opts, onClose, onSaved }: { opts: Opts; onClose: () => void; onSaved: (d: BulkPriceUpdate) => void }) {
  const [f, setF] = useState({ applyTo: "COMPANY", manufacturerId: "", productClassId: "", priceField: "PRICE", changePct: "", roundTo: "1" });
  const [picked, setPicked] = useState<string[]>([]);
  const [find, setFind] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const matches = useMemo(() => {
    const t = find.trim().toLowerCase();
    return (t ? opts.ops.products.filter((p) => p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t)) : opts.ops.products).slice(0, 50);
  }, [find, opts.ops.products]);
  const toggle = (id: string) => setPicked((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await createPriceUpdate({
        applyTo: f.applyTo, manufacturerId: f.applyTo === "COMPANY" ? f.manufacturerId || null : null, productClassId: f.applyTo === "CLASS" ? f.productClassId || null : null,
        itemIds: f.applyTo === "SELECTED" ? picked : [], priceField: f.priceField, changePct: Number(f.changePct) || 0, roundTo: Number(f.roundTo) || 0,
      }));
    } catch (e) {
      setErr({ message: errMsg(e, "Could not preview the update"), fields: fieldErrors(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} wide title="New price update" subtitle="Saves a draft with every product's old → new price. Nothing changes until you apply it." foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || !f.changePct}>{busy ? "Working…" : "Preview"}</button>
      </>
    }>
      {err && <Banner tone="danger" title="Not saved">{err.message}</Banner>}
      <FormGrid cols={3}>
        <Field label="Apply to" required>
          <select value={f.applyTo} onChange={(e) => set({ applyTo: e.target.value })}>{Object.entries(APPLY).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        {f.applyTo === "COMPANY" && (
          <Field label="Company" required error={err?.fields.manufacturerId}>
            <select value={f.manufacturerId} onChange={(e) => set({ manufacturerId: e.target.value })}><option value="">Choose…</option>{opts.demand.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
        )}
        {f.applyTo === "CLASS" && (
          <Field label="Product class" required error={err?.fields.productClassId}>
            <select value={f.productClassId} onChange={(e) => set({ productClassId: e.target.value })}><option value="">Choose…</option>{opts.ops.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </Field>
        )}
        {f.applyTo === "SELECTED" && <Field label="Products" error={err?.fields.itemIds}><input readOnly value={`${picked.length} selected`} /></Field>}
        <Field label="Price field" required>
          <select value={f.priceField} onChange={(e) => set({ priceField: e.target.value })}>{Object.entries(FIELD).map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>
        </Field>
        <Field label="Change %" required hint="Negative to lower (−90 to +500)" error={err?.fields.changePct}><input type="number" step="any" min={-90} max={500} value={f.changePct} onChange={(e) => set({ changePct: e.target.value })} placeholder="e.g. 10" /></Field>
        <Field label="Round to" hint="0 = 2 decimals" error={err?.fields.roundTo}>
          <select value={f.roundTo} onChange={(e) => set({ roundTo: e.target.value })}>{["0", "1", "5", "10", "50", "100"].map((r) => <option key={r} value={r}>{r === "0" ? "No rounding" : `Nearest ${r}`}</option>)}</select>
        </Field>
      </FormGrid>
      {f.applyTo === "SELECTED" && (
        <div className="mt">
          <label className="search-field"><Search /><input placeholder="Find products…" value={find} onChange={(e) => setFind(e.target.value)} /></label>
          <div className="list mt" style={{ maxHeight: 240, overflow: "auto" }}>
            {matches.map((p) => (
              <label key={p.id} className="list-item row" style={{ gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                <span><b>{p.name}</b> <small>{p.sku}</small></span>
              </label>
            ))}
            {!matches.length && <EmptyState title="No products found" />}
          </div>
        </div>
      )}
    </Modal>
  );
}

type DTab = "preview" | "history";
function PuDrawer({ id, can, onClose, onChanged }: { id: string | null; can: Can; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [doc, setDoc] = useState<BulkPriceUpdate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<DTab>("preview");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<"apply" | "undo" | "delete" | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    getPriceUpdate(id).then(setDoc).catch((e: unknown) => setErr(errMsg(e, "Could not load the price update")));
  }, [id]);
  const run = async (label: string, f: () => Promise<BulkPriceUpdate | void>) => {
    setBusy(true);
    setActionErr(null);
    try { const r = await f(); if (r) setDoc(r); toast(label, { tone: "good" }); setAsk(null); onChanged(); }
    catch (e) { const m = errMsg(e, "That didn’t work"); setActionErr(m); setAsk(null); toast(m, { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const foot = doc && can.edit ? (
    <>
      {doc.status === "DRAFT" && <Button disabled={busy} icon={<Trash2 />} onClick={() => setAsk("delete")}>Delete draft</Button>}
      {doc.status === "APPLIED" && <Button disabled={busy} icon={<RotateCcw />} onClick={() => setAsk("undo")}>Undo</Button>}
      {doc.status === "DRAFT" && <Button variant="primary" disabled={busy || !doc.lines.length} onClick={() => setAsk("apply")}>Apply to {doc.itemCount} product{doc.itemCount === 1 ? "" : "s"}</Button>}
    </>
  ) : undefined;
  const exportCsv = () => doc && downloadCsv(`${doc.docNo}.csv`, [["SKU", "Product", "Field", "Old", "New", "Change"], ...doc.lines.map((l) => [l.item.sku, l.item.name, FIELD[l.priceField] ?? l.priceField, l.oldValue, l.newValue, l.changeAmount])]);
  return (
    <>
      <Drawer open={!!id} onClose={onClose} wide title={doc?.docNo ?? "Price update"} subtitle={doc ? `${scope(doc)} · ${FIELD[doc.priceField] ?? doc.priceField} ${pctLabel(doc.changePct)}` : undefined} foot={foot}>
        {err ? <ErrorState message={err} /> : !doc ? <Skeleton style={{ height: 360 }} /> : (
          <>
            <div className="row mb" style={{ gap: 8 }}><St status={doc.status} /><Badge tone="outline">{APPLY[doc.applyTo]}</Badge>{doc.roundTo > 0 && <Badge tone="outline">Rounded to {doc.roundTo}</Badge>}</div>
            {actionErr && <Banner tone="danger" title="Not done">{actionErr}</Banner>}
            {doc.status === "DRAFT" && <Banner tone="info" title="Preview">These are the prices that will be set. Nothing has changed yet.</Banner>}
            {doc.status === "UNDONE" && doc.undoneAt && <Banner tone="warn" title="Undone">Old prices were restored on {dateLabel(doc.undoneAt)}.</Banner>}
            <Tabs<DTab> items={[{ key: "preview", label: `Prices (${doc.lines.length})` }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
            {tab === "preview" && (!doc.lines.length ? <div className="mt"><EmptyState icon={<Tags />} title="No products matched" description="No active products fit this selection." /></div> : (
              <>
                <div className="row mt" style={{ justifyContent: "flex-end" }}><Button size="sm" onClick={exportCsv}>Export CSV</Button></div>
                <div className="table-wrap mt"><table className="tbl">
                  <thead><tr><th>Product</th><th>Field</th><th className="num">Old</th><th className="num">New</th><th className="num">Change</th></tr></thead>
                  <tbody>
                    {doc.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item.name}</b><small>{l.item.sku}</small></td>
                        <td>{FIELD[l.priceField] ?? l.priceField}</td>
                        <td className="num">{amt(l.oldValue)}</td>
                        <td className="num"><b>{amt(l.newValue)}</b></td>
                        <td className="num" style={{ color: l.changeAmount < 0 ? "var(--danger)" : "var(--good)" }}>{l.changeAmount > 0 ? "+" : ""}{amt(l.changeAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </>
            ))}
            {tab === "history" && <div className="mt"><HistoryTab schema="Inventory" table="BulkPriceUpdates" id={doc.id} /></div>}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={ask === "apply" && !!doc} onClose={() => setAsk(null)} busy={busy} title={`Apply ${doc?.docNo ?? ""}?`} confirmLabel="Apply prices"
        onConfirm={() => doc && run(`${doc.docNo} applied`, () => applyPriceUpdate(doc.id, doc.rowVersion))}>{doc?.itemCount} product prices change now. Each change is logged and can be undone.</ConfirmDialog>
      <ConfirmDialog open={ask === "undo" && !!doc} onClose={() => setAsk(null)} danger busy={busy} title={`Undo ${doc?.docNo ?? ""}?`} confirmLabel="Restore old prices"
        onConfirm={() => doc && run(`${doc.docNo} undone`, () => undoPriceUpdate(doc.id, doc.rowVersion))}>Every product goes back to the price it had before this update.</ConfirmDialog>
      <ConfirmDialog open={ask === "delete" && !!doc} onClose={() => setAsk(null)} danger busy={busy} title={`Delete ${doc?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={() => doc && run(`${doc.docNo} deleted`, async () => { await deletePriceUpdate(doc.id, doc.rowVersion); onClose(); })}>The draft preview is removed. No prices change.</ConfirmDialog>
    </>
  );
}
