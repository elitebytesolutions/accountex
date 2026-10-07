"use client";

import {
  AlarmClock, CalendarClock, CalendarDays, CalendarX, ChartColumn, ChevronLeft, ChevronRight, CircleCheck, Download, EllipsisVertical, Hourglass, Layers, ListOrdered, Pencil,
  Plus, RotateCcw, Search, ShieldAlert, Tags, Trash2, Truck, Undo2, Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Batch, Product } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { batchSummary, createBatch, listBatches, listProducts, setBatchDisposition, updateBatch, type BatchSummary } from "../products-api";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Win = "expired" | "30" | "90" | "180" | "all";
const WINS: [Win, string, string, React.ReactNode, string][] = [
  ["expired", "Expired", "Quarantine immediately", <CalendarX key="i" />, "red"],
  ["30", "Next 30 days", "Sell first or return", <AlarmClock key="i" />, "orange"],
  ["90", "Next 90 days", "Priority sale / return", <Hourglass key="i" />, "warn"],
  ["180", "Within 6 months", "Monitor closely", <CalendarClock key="i" />, "info"],
  ["all", "All batches", "Complete register", <Layers key="i" />, "green"],
];
const PAGE = 50;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const iso = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => iso(new Date());
const daysTo = (e: string, t: string) => Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 864e5);
const dfmt = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const dayTone = (d: number) => `t${d < 0 ? "x" : d <= 30 ? "r" : d <= 90 ? "w" : d <= 183 ? "i" : "g"}`;

/** Template app/inventory/batches (4C-stock-ops.html + 9G-stock-ops.js §4): expiry windows, timeline, calendar, FEFO register, disposition. */
export function BatchesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(["ProductBatchDisposition"]);
  const [win, setWin] = useState<Win>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Batch[]>([]);
  const [total, setTotal] = useState(0);
  const [soon, setSoon] = useState<Batch[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; b: Batch } | null>(null);
  const [form, setForm] = useState<{ b: Batch | null; f: Record<string, string> } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [pq, setPq] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [writeOff, setWriteOff] = useState<Batch | null>(null);
  const today = todayIso();

  const key = `${win}|${q}|${page}|${attempt}`;
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      Promise.all([
        listBatches({ page, pageSize: PAGE, search: q || undefined, window: win === "all" ? undefined : win }),
        batchSummary(),
        listBatches({ page: 1, pageSize: 100, window: "180" }),
        listBatches({ page: 1, pageSize: 100, window: "expired" }),
      ])
        .then(([r, s, next, past]) => { if (!cancelled) { setRows(r.items); setTotal(r.total); setSummary(s); setSoon([...past.items, ...next.items]); setError(null); setLoadedKey(key); } })
        .catch((e: unknown) => { if (!cancelled) { setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load batches" }); setLoadedKey(key); } });
    }, q ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [key, page, q, win]);
  useEffect(() => {
    if (!form || form.b) return;
    let cancelled = false;
    const t = setTimeout(() => {
      listProducts({ page: 1, pageSize: 100, search: pq || undefined, sort: "name" }).then((r) => !cancelled && setProducts(r.items.filter((p) => !p.isKit))).catch(() => undefined);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form, pq]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const loading = loadedKey !== key;

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const w = summary?.windows ?? {};
  const cnt = (k: string) => w[k]?.count ?? 0;
  const val = (k: string) => w[k]?.value ?? 0;
  const card: Record<Win, { n: number; v: number }> = {
    expired: { n: cnt("expired"), v: val("expired") },
    "30": { n: cnt("30"), v: val("30") },
    "90": { n: cnt("30") + cnt("90"), v: val("30") + val("90") },
    "180": { n: cnt("30") + cnt("90") + cnt("180"), v: val("30") + val("90") + val("180") },
    all: { n: summary?.total.count ?? 0, v: summary?.total.value ?? 0 },
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const winLabel = WINS.find((x) => x[0] === win)![1];

  // Timeline: expired + the next 12 months, by value at cost (counts when there is no stock value yet).
  const now = new Date(`${today}T00:00:00Z`);
  const months = [{ l: "Expired", v: summary?.byMonth.find((m) => m.month === "expired")?.value ?? 0, n: summary?.byMonth.find((m) => m.month === "expired")?.count ?? 0, t: "tx" }];
  for (let m = 0; m < 12; m++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + m, 15));
    const k = iso(d).slice(0, 7);
    const row = summary?.byMonth.find((x) => x.month === k);
    months.push({ l: MON[d.getUTCMonth()] + (d.getUTCMonth() === 0 ? ` '${String(d.getUTCFullYear()).slice(2)}` : ""), v: row?.value ?? 0, n: row?.count ?? 0, t: dayTone(daysTo(iso(d), today)) });
  }
  const byValue = months.some((m) => m.v > 0);
  const metric = (m: { v: number; n: number }) => (byValue ? m.v : m.n);
  const mx = Math.max(...months.map(metric), 1);

  // Calendar: 26 weeks from this Monday.
  const start = new Date(now); start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const byDay = new Map<string, Batch[]>();
  soon.forEach((b) => { if (b.expiryDate) byDay.set(b.expiryDate, [...(byDay.get(b.expiryDate) ?? []), b]); });
  const dayMetric = (l: Batch[]) => (byValue ? l.reduce((s, b) => s + b.value, 0) : l.length);
  const maxV = Math.max(...[...byDay.values()].map(dayMetric), 1);
  const weeks = Array.from({ length: 26 }, (_, wk) => Array.from({ length: 7 }, (_, d) => { const dt = new Date(start); dt.setUTCDate(start.getUTCDate() + wk * 7 + d); return iso(dt); }));

  const act = async (b: Batch, disposition: string, done: string) => {
    try { await setBatchDisposition(b.id, { disposition, rowVersion: b.rowVersion }); toast(done, { tone: "info" }); reload(); } catch (e) { toast(apiMessage(e, "Could not change the disposition"), { tone: "danger" }); }
  };
  const items = (b: Batch): MenuItem[] => [
    ...(can.edit ? [
      { label: "Edit batch", icon: <Pencil />, onClick: () => { setErrs({}); setForm({ b, f: { batchNo: b.batchNo, expiryDate: b.expiryDate ?? "", mfgDate: b.mfgDate ?? "", unitCost: b.unitCost?.toString() ?? "", notes: b.notes ?? "" } }); } },
      { sep: true as const },
      ...(b.disposition !== "PRIORITY" ? [{ label: "Mark priority sale", icon: <Zap />, onClick: () => void act(b, "PRIORITY", `${b.batchNo} marked for priority sale`) }] : []),
      ...(b.disposition !== "CLEARANCE" ? [{ label: "Move to clearance", icon: <Tags />, onClick: () => void act(b, "CLEARANCE", `${b.batchNo} moved to clearance · ${b.product.name}`) }] : []),
      ...(b.disposition !== "RETURN_TO_PRINCIPAL" ? [{ label: "Return to principal", icon: <Undo2 />, onClick: () => void act(b, "RETURN_TO_PRINCIPAL", `${b.batchNo} marked for return to principal`) }] : []),
      ...(b.disposition !== "QUARANTINE" ? [{ label: "Quarantine", icon: <ShieldAlert />, onClick: () => void act(b, "QUARANTINE", `${b.batchNo} quarantined`) }] : []),
      ...(b.disposition !== "SALEABLE" ? [{ label: "Restore to saleable", icon: <RotateCcw />, onClick: () => void act(b, "SALEABLE", `${b.batchNo} back to saleable`) }] : []),
    ] : []),
    { label: "Transfer to another location", icon: <Truck />, disabled: true, onClick: () => undefined },
    ...(can.edit && b.disposition !== "WRITTEN_OFF" ? [{ sep: true as const }, { label: "Write off…", icon: <Trash2 />, danger: true, onClick: () => setWriteOff(b) }] : []),
  ];
  const exportCsv = () => {
    const csv = [["Product", "SKU", "Batch", "Expiry", "Days", "Qty", "Value", "Disposition"], ...rows.map((r) => [r.product.name, r.product.sku, r.batchNo, r.expiryDate ?? "", r.expiryDate ? daysTo(r.expiryDate, today) : "", r.onHand, r.value.toFixed(2), labelOf(lookups, "ProductBatchDisposition", r.disposition)])]
      .map((a) => a.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `batch-register-${today}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    toast(`Exported ${rows.length} batches to CSV`, { tone: "good" });
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    try {
      if (form.b) { const { expiryDate, mfgDate, unitCost, notes } = form.f; await updateBatch(form.b.id, { expiryDate, mfgDate, unitCost, notes, rowVersion: form.b.rowVersion }); } else await createBatch(form.f);
      toast(form.b ? "Batch saved" : `Batch ${form.f.batchNo} added`, { tone: "good" });
      setForm(null);
      reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the batch"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const setF = (k: string, v: string) => setForm((x) => (x ? { ...x, f: { ...x.f, [k]: v } } : x));

  return (
    <div className="so-root">
      <div className="so-bx">
        <div className="so-head">
          <span className="so-head-ico"><CalendarClock /></span>
          <div className="so-head-t"><div className="so-crumb">Inventory <ChevronRight /> <b>Batches &amp; Expiry</b></div><h1>Batches &amp; Expiry</h1><p>First-expiry-first-out register for every batch-tracked product, across all locations.</p></div>
          <div className="so-head-r">
            <span className="tagline so-tagline">First to expire, first to go</span>
            <button className="btn secondary" type="button" disabled={!rows.length} onClick={exportCsv}><Download />Export register</button>
            <button className="btn primary" type="button" disabled title="Stock transfers arrive with the stock phases"><Truck />Move stock</button>
          </div>
        </div>
        <div className="so-bx-cards">
          {WINS.map(([k, l, s, ic, tone], i) => (
            <button key={k} type="button" className={cn("so-bxc", tone, win === k && "on")} style={{ ["--i" as string]: i }} onClick={() => { setWin(k); setPage(1); }}>
              <span className="so-bxc-i">{ic}</span><span className="so-bxc-t">{l}</span><b>{fmt(card[k].n)}</b><small>{s}</small><em>Rs {fmt(card[k].v)}</em>
            </button>
          ))}
        </div>
        <div className="so-bx-viz">
          <div className="panel"><div className="so-ph"><span className="so-ph-ico"><ChartColumn /></span><div><h3>Expiry timeline</h3><p>{byValue ? "Stock value expiring each month at cost" : "Batches expiring each month (stock value shows once goods are received)"}</p></div><span className="spacer" /><span className="so-legend"><i className="tx" />Expired<i className="tr" />≤30d<i className="tw" />≤90d<i className="ti" />≤6m<i className="tg" />Later</span></div>
            <div className="so-tlbars">
              <div className="so-tlb-grid">{[1, 0.5, 0].map((g) => <span key={g} style={{ bottom: `${g * 100}%` }}><em>{g ? (byValue ? `Rs ${fmt(Math.round((mx * g) / 1000))}k` : (mx * g) % 1 ? "" : fmt(mx * g)) : "0"}</em></span>)}</div>
              {months.map((m, i) => <div key={i} className="so-tlb" title={`${m.l}: ${byValue ? `Rs ${fmt(m.v)} · ` : ""}${m.n} batches`} style={{ ["--i" as string]: i }}><i className={m.t} style={{ ["--h" as string]: `${metric(m) ? Math.max(3, (metric(m) / mx) * 100) : 0}%` }} /><span>{m.l}</span></div>)}
            </div>
          </div>
          <div className="panel"><div className="so-ph"><span className="so-ph-ico"><CalendarDays /></span><div><h3>Expiry calendar</h3><p>Next 26 weeks · darker = more {byValue ? "value" : "batches"} expiring</p></div></div>
            <div className="so-heat">
              <div className="so-heat-m">{weeks.map((wk, i) => { const d = new Date(`${wk[0]}T00:00:00Z`); return d.getUTCDate() <= 7 ? <span key={i} style={{ gridColumn: i + 1 }}>{MON[d.getUTCMonth()]}</span> : null; })}</div>
              <div className="so-heat-wrap"><div className="so-heat-d"><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span /></div>
                <div className="so-heat-g">{weeks.map((wk, i) => (
                  <div key={i} className="so-hw">{wk.map((day) => {
                    const list = byDay.get(day) ?? [];
                    const v = dayMetric(list);
                    const lv = !v ? 0 : v / maxV > 0.6 ? 4 : v / maxV > 0.25 ? 3 : v / maxV > 0.08 ? 2 : 1;
                    return <i key={day} className={cn(`l${lv}`, day < today && "past", day === today && "today")} title={`${dfmt(day)}${list.length ? ` · ${list.map((b) => b.batchNo).join(", ")}${byValue ? ` · Rs ${fmt(v)}` : ""}` : " · nothing expiring"}`} />;
                  })}</div>
                ))}</div></div>
              <div className="so-heat-leg">Less<i className="l0" /><i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" />More<span className="spacer" /><i className="today" />Today</div>
            </div>
          </div>
        </div>
        <div className="panel flush">
          <div className="so-ph pad"><span className="so-ph-ico"><ListOrdered /></span><div><h3>FEFO register</h3><p className="so-bx-sub">{winLabel} · FEFO priority order · {fmt(total)} batch records</p></div><span className="spacer" />
            <label className="so-search so-bx-q"><Search /><input placeholder="Search product or batch…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
            {can.create && <button className="btn secondary sm" type="button" onClick={() => { setErrs({}); setPq(""); setForm({ b: null, f: { itemId: "", batchNo: "", expiryDate: "", mfgDate: "", unitCost: "", notes: "" } }); }}><Plus />Add batch</button>}
          </div>
          <div className="table-wrap"><table className="tbl so-bx-tbl"><thead><tr><th>#</th><th>Product</th><th>Batch</th><th>Location</th><th>Expiry</th><th>Days remaining</th><th className="num">Qty</th><th className="num">Value (Rs)</th><th>Disposition</th><th /></tr></thead>
            <tbody>
              {loading && !rows.length ? <tr><td colSpan={10}><Skeleton style={{ height: 120 }} /></td></tr> : rows.length ? rows.map((r, k) => {
                const d = r.expiryDate ? daysTo(r.expiryDate, today) : null;
                return (
                  <tr key={r.id} className={cn(r.disposition === "WRITTEN_OFF" && "pr-muted")}>
                    <td className="so-idx">{(page - 1) * PAGE + k + 1}</td>
                    <td><div className="so-prod"><span className="so-pt"><Layers /></span><div><b><Link href={`/inventory/products/${r.product.id}`} style={{ color: "inherit", textDecoration: "none" }}>{r.product.name}</Link></b><small>{r.product.sku}</small></div></div></td>
                    <td className="so-mono"><b>{r.batchNo}</b></td><td className="so-nw">—</td><td className="so-nw">{r.expiryDate ? dfmt(r.expiryDate) : "No expiry"}</td>
                    <td>{d === null ? "—" : <><span className={cn("so-days", dayTone(d))}>{d < 0 ? `${Math.abs(d)} days overdue` : d === 0 ? "Expires today" : `${d} days`}</span><span className={cn("so-dbar", dayTone(d))}><i style={{ width: `${Math.max(4, Math.min(100, (d / 365) * 100))}%` }} /></span></>}</td>
                    <td className="num">{fmt(r.onHand)}</td><td className="num">{fmt(r.value, 2)}</td>
                    <td><span className={cn("badge dot", toneOf(lookups, "ProductBatchDisposition", r.disposition))}>{labelOf(lookups, "ProductBatchDisposition", r.disposition)}</span></td>
                    <td className="so-c"><button type="button" className="so-rowmenu" aria-label="Batch actions" onClick={(e) => setMenu({ anchor: e.currentTarget, b: r })}><EllipsisVertical /></button></td>
                  </tr>
                );
              }) : <tr><td colSpan={10}><div className="so-empty"><CircleCheck /><b>No batches in this window</b><span>{q ? "Nothing matches the search." : "Nothing to act on here."}</span></div></td></tr>}
            </tbody>
            <tfoot><tr className="total"><td colSpan={6}>Total · {fmt(rows.length)} batches{pages > 1 ? ` on this page` : ""}</td><td className="num">{fmt(rows.reduce((s, r) => s + r.onHand, 0))}</td><td className="num">{fmt(rows.reduce((s, r) => s + r.value, 0), 2)}</td><td colSpan={2} /></tr></tfoot>
          </table></div>
          {pages > 1 && <div className="pr-pager" style={{ padding: 12 }}><button type="button" className="nav" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft /></button><span className="dots">Page {page} of {pages}</span><button type="button" className="nav" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight /></button></div>}
        </div>
      </div>

      {menu && <Menu anchor={menu.anchor} items={items(menu.b)} onClose={() => setMenu(null)} />}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.b ? `Edit batch ${form.b.batchNo}` : "Add batch"} subtitle={form?.b ? `${form.b.product.sku} · ${form.b.product.name}` : "Batches normally arrive with goods received (Phase 20)"}
        foot={<><button type="button" className="btn secondary" onClick={() => setForm(null)}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
        {form && (
          <FormGrid>
            {!form.b && <>
              <Field label="Find product" full><input type="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Code or name…" /></Field>
              <Field label="Product" required full error={errs.itemId}><select value={form.f.itemId} onChange={(e) => { const p = products.find((x) => x.id === e.target.value); setF("itemId", e.target.value); if (p && !form.f.unitCost) setF("unitCost", String(p.cost)); }}><option value="">Choose…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}{p.trackExpiry ? "" : " (not expiry-tracked)"}</option>)}</select></Field>
              <Field label="Batch number" required error={errs.batchNo}><input value={form.f.batchNo} maxLength={40} onChange={(e) => setF("batchNo", e.target.value)} /></Field>
            </>}
            <Field label="Unit cost" error={errs.unitCost}><input inputMode="decimal" value={form.f.unitCost} onChange={(e) => setF("unitCost", e.target.value)} /></Field>
            <Field label="Manufactured" error={errs.mfgDate}><input type="date" value={form.f.mfgDate} onChange={(e) => setF("mfgDate", e.target.value)} /></Field>
            <Field label="Expiry" error={errs.expiryDate}><input type="date" value={form.f.expiryDate} onChange={(e) => setF("expiryDate", e.target.value)} /></Field>
            <Field label="Notes" full error={errs.notes}><input value={form.f.notes} maxLength={500} onChange={(e) => setF("notes", e.target.value)} /></Field>
          </FormGrid>
        )}
      </Modal>
      <ConfirmDialog open={!!writeOff} onClose={() => setWriteOff(null)} title={`Write off ${writeOff?.batchNo}?`} confirmLabel="Write off" danger onConfirm={async () => {
        if (!writeOff) return;
        const b = writeOff;
        setWriteOff(null);
        await act(b, "WRITTEN_OFF", `${b.batchNo} written off`);
      }}>The batch is marked written off. The stock write-off voucher (removing the quantity and expensing its value) arrives with the stock phases.</ConfirmDialog>
    </div>
  );
}
