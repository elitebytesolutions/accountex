"use client";

import { Eye, File, History, Minus, PackageSearch, Pencil, Plus, Printer, ScanBarcode, Search, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { labelPages, type LabelJob, type LabelTemplate, type Product } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  createLabelTemplate, deleteLabelTemplate, getProduct, listBatches, listLabelJobs, listLabelTemplates, listProducts, recordLabelJob, updateLabelTemplate,
} from "../products-api";
import { Label, type LabelItem, type LabelOptions } from "./barcode";
import { NamedIcon } from "./named-icon";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Pick = { item: LabelItem; copies: number };
type TplForm = { id: string | null; rv: number; sys?: boolean; f: Record<string, string | boolean> };
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const CAP = 160;
/** The template's three CSS variants; custom templates use the closest one. */
const variant = (t: LabelTemplate) => (t.media === "SHEET" ? "a4" : t.widthMm < 45 ? "small" : "thermal");
const subtitle = (t: LabelTemplate) =>
  t.media === "SHEET" ? `A4 sheet · ${t.sheetColumns ?? "?"} × ${t.sheetRows ?? "?"} labels (${fmt(t.widthMm, 1)} × ${fmt(t.heightMm, 1)} mm)` : `Roll · ${fmt(t.widthMm, 1)} × ${fmt(t.heightMm, 1)} mm`;
/** Rolls before sheets, wider rolls first (Thermal 2×1", 38×25mm, A4 sheet), as in the template. */
const tplOrder = (a: LabelTemplate, b: LabelTemplate) => (a.media === b.media ? b.widthMm - a.widthMm || a.name.localeCompare(b.name) : a.media === "ROLL" ? -1 : 1);
const perSheet = (t: LabelTemplate) => t.labelsPerSheet ?? (t.sheetColumns ?? 1) * (t.sheetRows ?? 1);
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

async function loadItem(id: string): Promise<LabelItem> {
  const [p, b] = await Promise.all([getProduct(id), listBatches({ page: 1, pageSize: 100, product: id })]);
  const first = b.items.filter((x) => x.expiryDate && x.disposition !== "WRITTEN_OFF").sort((x, y) => x.expiryDate!.localeCompare(y.expiryDate!))[0];
  return {
    sku: p.sku, name: p.name, nameUrdu: p.nameUrdu, company: p.company?.name ?? null, price: p.price, ctn: p.ctn,
    piece: p.barcodes.find((x) => x.kind === "PIECE" && x.isPrimary)?.barcode ?? p.upc,
    carton: p.barcodes.find((x) => x.kind === "CARTON" && x.isPrimary)?.barcode ?? null,
    batch: first ? { no: first.batchNo, expiry: first.expiryDate } : null,
  };
}

/** Template app/inventory/labels (4B-products.html + 9F-products.js §6): pick products, choose a template, live preview, browser print. Each print is recorded. */
export function LabelsScreen({ can, initialIds }: { can: Can; initialIds: string[] }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<LabelTemplate[] | null>(null);
  const [jobs, setJobs] = useState<LabelJob[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [picks, setPicks] = useState<Map<string, Pick>>(new Map());
  const [q, setQ] = useState("");
  const [tplId, setTplId] = useState("");
  const [o, setO] = useState<LabelOptions>({ price: true, urdu: false, batch: false, company: true, ctn: false });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [printAll, setPrintAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manage, setManage] = useState(false);
  const [tf, setTf] = useState<TplForm | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [del, setDel] = useState<LabelTemplate | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listLabelTemplates(), listLabelJobs()])
      .then(([raw, j]) => { if (!cancelled) { const t = [...raw].sort(tplOrder); setTemplates(t); setJobs(j); setError(null); setTplId((cur) => (cur && t.some((x) => x.id === cur && x.isActive) ? cur : (t.find((x) => x.isActive && x.code === "THERMAL_2X1") ?? t.find((x) => x.isActive))?.id ?? "")); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load label templates" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listProducts({ page: 1, pageSize: 100, search: q || undefined, sort: "name" }).then((r) => !cancelled && setProducts(r.items)).catch(() => undefined);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    const ids = initialIds.slice(0, 200);
    Promise.all(ids.map((id) => loadItem(id).then((item) => [id, item] as const).catch(() => null))).then((rows) => {
      if (cancelled) return;
      const ok = rows.filter((r): r is readonly [string, LabelItem] => !!r);
      setPicks(new Map(ok.map(([id, item]) => [id, { item, copies: ok.length === 1 ? 8 : 2 }])));
    });
    return () => { cancelled = true; };
  }, [initialIds]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const tpl = templates?.find((t) => t.id === tplId) ?? null;
  const v = tpl ? variant(tpl) : "thermal";
  const all: LabelItem[] = [];
  picks.forEach((p) => { for (let k = 0; k < p.copies; k++) all.push(p.item); });
  const shown = printAll ? all : all.slice(0, CAP);
  const pages = tpl ? Math.max(1, labelPages(tpl, all.length)) : 1;
  const per = tpl && tpl.media === "SHEET" ? perSheet(tpl) : 0;

  const toggle = async (p: Product, on: boolean) => {
    if (!on) { setPicks((m) => { const n = new Map(m); n.delete(p.id); return n; }); return; }
    try {
      const item = await loadItem(p.id);
      setPicks((m) => new Map(m).set(p.id, { item, copies: 1 }));
    } catch (e) { toast(apiMessage(e, "Could not load the product"), { tone: "danger" }); }
  };
  const setCopies = (id: string, n: number) => setPicks((m) => { const x = m.get(id); return x ? new Map(m).set(id, { ...x, copies: Math.max(1, Math.min(500, Math.floor(n) || 1)) }) : m; });
  const print = async () => {
    if (!tpl || !all.length) return;
    setBusy(true);
    try {
      await recordLabelJob({
        templateId: tpl.id, showPrice: o.price, showUrduName: o.urdu, showBatchExpiry: o.batch, showCompany: o.company, useCartonBarcode: o.ctn,
        source: initialIds.length ? "CATALOGUE" : "LABELS", lines: [...picks.entries()].map(([itemId, p]) => ({ itemId, copies: p.copies })),
      });
    } catch (e) { setBusy(false); toast(apiMessage(e, "Could not record the print job"), { tone: "danger" }); return; }
    flushSync(() => setPrintAll(true));
    document.body.classList.add("pr-printing");
    const done = () => { document.body.classList.remove("pr-printing"); setPrintAll(false); removeEventListener("afterprint", done); };
    addEventListener("afterprint", done);
    try { window.print(); } catch { /* print blocked */ }
    setTimeout(done, 1500);
    setBusy(false);
    toast(`Sent ${fmt(all.length)} label${all.length === 1 ? "" : "s"} to the printer`, { tone: "good" });
    reload();
  };
  const saveTpl = async () => {
    if (!tf) return;
    setBusy(true);
    setErrs({});
    try {
      if (tf.id) { const { code, ...rest } = tf.f; await updateLabelTemplate(tf.id, { ...(tf.sys ? rest : { ...rest, code }), rowVersion: tf.rv }); } else await createLabelTemplate(tf.f);
      toast("Template saved", { tone: "good" });
      setTf(null);
      reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the template"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const setT = (k: string, val: string | boolean) => setTf((x) => (x ? { ...x, f: { ...x.f, [k]: val } } : x));
  const ts = (k: string) => String(tf?.f[k] ?? "");
  const sorted = [...products].sort((a, b) => Number(picks.has(b.id)) - Number(picks.has(a.id)));
  const pickedHidden = [...picks.keys()].filter((id) => !products.some((p) => p.id === id));

  const sheetPages = [];
  if (v === "a4" && per) for (let pg = 0; pg < (printAll ? pages : Math.min(pages, 4)); pg++) sheetPages.push(pg);

  return (
    <>
      <div className="pr-head">
        <span className="pr-cube"><ScanBarcode /></span>
        <div className="pr-head-t"><h1>Barcode Labels</h1><p>Pick products, choose a template and print shelf or carton labels.</p></div>
        <div className="pr-head-act">
          <span className="pr-lb-count">{fmt(all.length)} label{all.length === 1 ? "" : "s"} · {picks.size} product{picks.size === 1 ? "" : "s"}</span>
          {can.edit && <button className="btn secondary" type="button" onClick={() => setManage(true)}><Settings2 />Templates</button>}
          {can.edit && <button className="btn primary" type="button" disabled={!all.length || !tpl || busy} onClick={print}><Printer />Print labels</button>}
        </div>
      </div>
      <div className="pr-lb-layout">
        <div className="pr-lb-side">
          <div className="pr-card">
            <div className="pr-card-h"><span className="pr-ptile"><PackageSearch /></span><div><b>Products</b><small>Tick products and set copies</small></div><span className="spacer" /><button className="pr-link" type="button" onClick={() => setPicks(new Map())}>Clear</button></div>
            <label className="pr-ctl pr-lb-q"><Search /><input type="search" placeholder="Search code, name or UPC…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" /></label>
            <div className="pr-lb-picks">
              {pickedHidden.map((id) => { const p = picks.get(id)!; return (
                <div key={id} className="pr-pick on"><label><input type="checkbox" checked onChange={() => setPicks((m) => { const n = new Map(m); n.delete(id); return n; })} aria-label={`Pick ${p.item.sku}`} /><span className="pr-tile xs"><NamedIcon name="package" /></span><span><b>{p.item.name}</b><small>{p.item.sku} · Rs {fmt(p.item.price)}</small></span></label>
                  <Stepper n={p.copies} on set={(n) => setCopies(id, n)} /></div>
              ); })}
              {sorted.map((p) => {
                const on = picks.has(p.id);
                return (
                  <div key={p.id} className={cn("pr-pick", on && "on")}>
                    <label><input type="checkbox" checked={on} onChange={(e) => void toggle(p, e.target.checked)} aria-label={`Pick ${p.sku}`} /><span className="pr-tile xs" style={{ ["--co" as string]: p.company?.brandColour ?? "var(--primary)" }}><NamedIcon name={p.productClass?.icon ?? "package"} /></span><span><b>{p.name}</b><small>{p.sku} · Rs {fmt(p.price)}</small></span></label>
                    <Stepper n={picks.get(p.id)?.copies ?? 1} on={on} set={(n) => setCopies(p.id, n)} />
                  </div>
                );
              })}
              {!sorted.length && !pickedHidden.length && <div className="pr-emptybox"><b>No products match</b></div>}
            </div>
          </div>
          <div className="pr-card">
            <div className="pr-card-h"><span className="pr-ptile"><SlidersHorizontal /></span><div><b>Template &amp; options</b><small>What goes on each label</small></div></div>
            <div className="seg pr-seg pr-lb-tpl">
              {templates?.filter((t) => t.isActive).map((t) => <button key={t.id} type="button" className={cn(t.id === tplId && "active")} onClick={() => setTplId(t.id)}>{t.name}</button>)}
            </div>
            <div className="pr-lb-opts">
              {([["price", "Show price"], ["urdu", "Urdu name"], ["batch", "Batch / expiry"], ["company", "Company"], ["ctn", "Carton barcode"]] as const).map(([k, l]) => (
                <label key={k} className="switch"><input type="checkbox" checked={o[k]} onChange={(e) => setO((x) => ({ ...x, [k]: e.target.checked }))} /><i /><span>{l}</span></label>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div className="pr-card pr-lb-main">
            <div className="pr-card-h"><span className="pr-ptile"><Eye /></span><div><b>Live preview</b><small>{tpl ? subtitle(tpl) : "Choose a template"}</small></div><span className="spacer" />
              <span className="pill"><File />{v === "a4" ? `${pages} page${pages === 1 ? "" : "s"} · ${Math.max(0, pages * per - all.length)} blank` : `${v === "thermal" ? `${fmt(all.length * ((tpl?.heightMm ?? 25.4) / 25.4), 1)} in` : `${fmt(all.length * ((tpl?.heightMm ?? 25) + 3))} mm`} of roll`}</span></div>
            <div className="pr-lb-stage">
              <div className={cn("pr-lb-sheet", v)}>
                {v === "a4" ? sheetPages.map((pg) => (
                  <div key={pg} className="pr-a4" aria-label={`Page ${pg + 1}`}><span className="pr-a4-n">Page {pg + 1}</span>
                    {Array.from({ length: per }, (_, s) => { const it = shown[pg * per + s]; return it ? <Label key={s} item={it} o={o} tpl="a4" /> : <div key={s} className="pr-label a4 blank" />; })}
                  </div>
                )) : shown.length ? (
                  <>
                    {shown.map((it, i) => <div key={i} style={{ display: "contents", ["--i" as string]: Math.min(i, 30) }}><Label item={it} o={o} tpl={v} /></div>)}
                    {!printAll && all.length > CAP && <div className="pr-lb-more">+{fmt(all.length - CAP)} more labels</div>}
                  </>
                ) : <div className="pr-emptybox"><span><ScanBarcode /></span><b>No labels yet</b><small>Tick a product on the left to preview its label.</small></div>}
              </div>
            </div>
          </div>
          <div className="pr-card">
            <div className="pr-card-h"><span className="pr-ptile"><History /></span><div><b>Recent print jobs</b><small>Every print is recorded</small></div></div>
            {jobs.length ? (
              <div className="pr-tw"><table className="tbl"><thead><tr><th>When</th><th>Template</th><th className="num">Products</th><th className="num">Labels</th><th>By</th></tr></thead><tbody>
                {jobs.slice(0, 10).map((j) => <tr key={j.id}><td>{dt(j.printedAt)}</td><td>{j.template.name}</td><td className="num">{fmt(j.productCount)}</td><td className="num">{fmt(j.totalLabels)}</td><td>{j.printedBy ?? "—"}</td></tr>)}
              </tbody></table></div>
            ) : <p className="pr-muted-p" style={{ padding: "0 16px 16px" }}>No labels printed yet.</p>}
          </div>
        </div>
      </div>

      <Modal open={manage && !tf} onClose={() => setManage(false)} title="Label templates" subtitle="Roll sizes and sheet layouts" xl
        foot={<><button type="button" className="btn secondary" onClick={() => setManage(false)}>Close</button>{can.create && <button type="button" className="btn primary" onClick={() => { setErrs({}); setTf({ id: null, rv: 0, f: { code: "", name: "", media: "ROLL", widthMm: "", heightMm: "", sheetColumns: "", sheetRows: "", labelsPerSheet: "" } }); }}><Plus />New template</button>}</>}>
        <div className="pr-tw"><table className="tbl"><thead><tr><th>Code</th><th>Name</th><th>Media</th><th>Size (mm)</th><th>Sheet</th><th>Status</th><th /></tr></thead><tbody>
          {templates?.map((t) => (
            <tr key={t.id}><td className="pr-mono">{t.code}</td><td>{t.name}{t.isSystem && <span className="badge neutral" style={{ marginLeft: 6 }}>System</span>}</td><td>{t.media === "SHEET" ? "Sheet" : "Roll"}</td>
              <td>{fmt(t.widthMm, 1)} × {fmt(t.heightMm, 1)}</td><td>{t.media === "SHEET" ? `${t.sheetColumns} × ${t.sheetRows}` : "—"}</td>
              <td><span className={cn("badge dot", t.isActive ? "good" : "neutral")}>{t.isActive ? "Active" : "Inactive"}</span></td>
              <td className="actions">{<>
                <button type="button" className="icon-btn-sm" aria-label={`Edit ${t.code}`} onClick={() => { setErrs({}); setTf({ id: t.id, rv: t.rowVersion, sys: t.isSystem, f: { code: t.code, name: t.name, media: t.media, widthMm: String(t.widthMm), heightMm: String(t.heightMm), sheetColumns: t.sheetColumns?.toString() ?? "", sheetRows: t.sheetRows?.toString() ?? "", labelsPerSheet: t.labelsPerSheet?.toString() ?? "", isActive: t.isActive } }); }}><Pencil /></button>
                {can.remove && !t.isSystem && <button type="button" className="icon-btn-sm" aria-label={`Delete ${t.code}`} onClick={() => setDel(t)}><Trash2 /></button>}
              </>}</td></tr>
          ))}
        </tbody></table></div>
      </Modal>
      <Modal open={!!tf} onClose={() => setTf(null)} title={tf?.id ? "Edit template" : "New template"}
        foot={<><button type="button" className="btn secondary" onClick={() => setTf(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={saveTpl}>{busy ? "Saving…" : "Save"}</button></>}>
        <FormGrid>
          <Field label="Code" required error={errs.code}><input value={ts("code")} maxLength={30} disabled={tf?.sys} onChange={(e) => setT("code", e.target.value.toUpperCase())} placeholder="SHELF_50X30" /></Field>
          <Field label="Name" required error={errs.name}><input value={ts("name")} maxLength={60} onChange={(e) => setT("name", e.target.value)} /></Field>
          <Field label="Media" error={errs.media}><select value={ts("media")} onChange={(e) => setT("media", e.target.value)}><option value="ROLL">Roll</option><option value="SHEET">Sheet</option></select></Field>
          <span />
          <Field label="Width (mm)" required error={errs.widthMm}><input inputMode="decimal" value={ts("widthMm")} onChange={(e) => setT("widthMm", e.target.value)} /></Field>
          <Field label="Height (mm)" required error={errs.heightMm}><input inputMode="decimal" value={ts("heightMm")} onChange={(e) => setT("heightMm", e.target.value)} /></Field>
          {ts("media") === "SHEET" && <>
            <Field label="Columns" required error={errs.sheetColumns}><input inputMode="numeric" value={ts("sheetColumns")} onChange={(e) => setT("sheetColumns", e.target.value)} /></Field>
            <Field label="Rows" required error={errs.sheetRows}><input inputMode="numeric" value={ts("sheetRows")} onChange={(e) => setT("sheetRows", e.target.value)} /></Field>
            <Field label="Labels per sheet" error={errs.labelsPerSheet} hint="Blank = columns × rows"><input inputMode="numeric" value={ts("labelsPerSheet")} onChange={(e) => setT("labelsPerSheet", e.target.value)} /></Field>
          </>}
          {tf?.id && <Check label="Active" checked={Boolean(tf.f.isActive)} onChange={(e) => setT("isActive", e.target.checked)} />}
        </FormGrid>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Delete ${del?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!del) return;
        const t = del;
        setDel(null);
        try { await deleteLabelTemplate(t.id, t.rowVersion); toast("Template deleted", { tone: "danger" }); reload(); } catch (e) { toast(apiMessage(e, "Could not delete the template"), { tone: "danger" }); }
      }}>Templates already used by print jobs can only be deactivated.</ConfirmDialog>
    </>
  );
}

function Stepper({ n, on, set }: { n: number; on: boolean; set: (n: number) => void }) {
  return (
    <div className="pr-step sm">
      <button type="button" disabled={!on} onClick={() => set(n - 1)} aria-label="Fewer"><Minus /></button>
      <input type="number" min={1} max={500} value={n} disabled={!on} onChange={(e) => set(Number(e.target.value))} aria-label="Copies" />
      <button type="button" disabled={!on} onClick={() => set(n + 1)} aria-label="More"><Plus /></button>
    </div>
  );
}
