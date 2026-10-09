"use client";

import {
  Ban, Banknote, Check, CircleCheck, CircleDashed, CirclePause, FileCheck2, Hourglass, Inbox, MapPin, MapPinCheck, MapPinX, MessageSquareText, PackageCheck,
  PackageSearch, Pencil, Plus, RefreshCw, Smartphone, Split, Trash2, TriangleAlert, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { tierRate, type OrderBooking, type OrderBookingList, type WholesaleOptions } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check as CheckField, Field, FormGrid, Switch } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel, isoDay } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { errMsg, fieldErrors, fmtQty, initials, ReasonModal, rs } from "@/features/sales/components/quotations-screen";
import { ApiError } from "@/lib/api/errors";
import {
  cancelBooking, checkBookingStock, convertBookings, createBooking, deleteBooking, getBooking, listBookings, updateBooking, wholesaleOptions,
} from "../api";

type Can = { create: boolean; edit: boolean; delete: boolean; approve: boolean };
type Row = OrderBookingList["items"][number];
type Failed = { docNo: string; message: string }[];
const PAGE = 25;
const OPEN = ["NEW", "CHECKED", "HELD"];
const CHIPS = [
  { label: "All", status: "" }, { label: "New", status: "NEW" }, { label: "Checked", status: "CHECKED" }, { label: "Held", status: "HELD" },
  { label: "Converted", status: "CONVERTED" }, { label: "Partial", status: "PARTIAL" }, { label: "Cancelled", status: "CANCELLED" },
];
const chipCount = (c: Record<string, number>, s: string) => (s ? c[s] ?? 0 : Object.values(c).reduce((t, n) => t + n, 0));

// ---------------------------------------------------------------- small helpers
const pad = (n: number) => String(n).padStart(2, "0");
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
const n2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
/** Template qtyStr: "3 ctn + 4", or pieces when the product has no carton size. */
const qtyStr = (q: number, ctn: number) => {
  const p = Math.max(1, ctn || 1);
  const v = Math.round(q);
  if (p === 1) return `${n0(v)} pcs`;
  const c = Math.floor(v / p), r = v % p;
  return c ? `${n0(c)} ctn${r ? ` + ${r}` : ""}` : `${r} pcs`;
};
const offLabel = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km off` : `${Math.round(m)} m off`);

function useDays() {
  const now = new Date();
  return { today: isoDay(now), yesterday: isoDay(new Date(now.getTime() - 86_400_000)) };
}
const dayWord = (d: string, days: { today: string; yesterday: string }) => (d === days.today ? "Today" : d === days.yesterday ? "Yesterday" : dateLabel(d));

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; tone: string; icon?: ReactNode }> = {
    CHECKED: { label: "Checked", tone: "violet", icon: <PackageCheck /> }, HELD: { label: "Held", tone: "warn", icon: <CirclePause /> },
    CONVERTED: { label: "Converted", tone: "good", icon: <Check /> }, PARTIAL: { label: "Partial", tone: "warn", icon: <Split /> }, CANCELLED: { label: "Cancelled", tone: "danger", icon: <Ban /> },
  };
  if (status === "NEW") return <Badge tone="info" dot>New</Badge>;
  const s = m[status] ?? { label: status.toLowerCase(), tone: "neutral" };
  return <span className={`badge ${s.tone}`}>{s.icon}{s.label}</span>;
}

function Gps({ b }: { b: Pick<Row, "gpsVerified" | "gpsOffsetM"> }) {
  if (b.gpsVerified) return <span className="ws2-gps ok"><MapPinCheck />GPS verified</span>;
  if (b.gpsOffsetM !== null) return <span className="ws2-gps warn" title={`Booked ${offLabel(b.gpsOffsetM).replace(" off", "")} away from the shop pin`}><MapPinX />{offLabel(b.gpsOffsetM)}</span>;
  return <span className="ws2-dash">—</span>;
}

function StockCell({ b, options }: { b: Row; options: WholesaleOptions | null }) {
  if (b.status === "CANCELLED") return <span className="ws2-dash">—</span>;
  if (b.status === "CONVERTED") return <span className="ws2-muted">Invoiced</span>;
  if (!b.stockCheckedAt) return <span className="ws2-muted ws2-nc"><CircleDashed />Not checked</span>;
  if (!b.shortLineCount) return <span className="ws2-stk ok"><CircleCheck />All in stock</span>;
  return (
    <>
      <span className="ws2-stk bad"><TriangleAlert />{b.shortLineCount} short</span>
      <div className="ws2-stk-l">
        {b.short.map((x) => {
          const p = options?.products.find((i) => i.sku === x.sku);
          return <small key={x.sku}>{p ? p.name.split(" ").slice(0, 2).join(" ") : x.sku} <b>−{p ? qtyStr(x.need - x.have, p.ctn) : fmtQty(x.need - x.have)}</b></small>;
        })}
      </div>
    </>
  );
}

function Kpi({ title, icon, tone, value, sub }: { title: string; icon: ReactNode; tone?: string; value: ReactNode; sub: ReactNode }) {
  return <div className="kpi"><div className="kpi-top"><span>{title}</span><span className={cn("icon-well", tone)}>{icon}</span></div><strong>{value}</strong><small>{sub}</small></div>;
}

// ================================================================ screen
/** Template app/wholesale/bookings (4D-wholesale.html + 9H-wholesale.js): KPIs, status chips, booker / route / date filters, bulk stock check and conversion, detail drawer. */
export function BookingsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const router = useRouter();
  const days = useDays();
  const [status, setStatus] = useState("");
  const [booker, setBooker] = useState("");
  const [route, setRoute] = useState("");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrderBookingList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [options, setOptions] = useState<WholesaleOptions | null>(null);
  const [optErr, setOptErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allowPartial, setAllowPartial] = useState(true);
  const [busy, setBusy] = useState<"check" | "convert" | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [editor, setEditor] = useState<{ b: OrderBooking | null } | null>(null);
  const [cancelling, setCancelling] = useState<OrderBooking | null>(null);
  const [del, setDel] = useState<OrderBooking | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  useEffect(() => {
    wholesaleOptions().then(setOptions).catch((e: unknown) => setOptErr(errMsg(e, "Could not load shops, routes and products")));
  }, []);
  useEffect(() => {
    let cancelled = false;
    listBookings({ status, booker, route, from: date, to: date, page, pageSize: PAGE })
      .then((l) => {
        if (cancelled) return;
        setData(l);
        setError(null);
        const open = new Set(l.items.filter((x) => OPEN.includes(x.status)).map((x) => x.id));
        setSelected((s) => new Set([...s].filter((id) => open.has(id))));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load order bookings" }));
    return () => { cancelled = true; };
  }, [status, booker, route, date, page, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const k = data?.kpis;
  const items = data?.items ?? [];
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const filtered = !!(status || booker || route || date);
  const selectable = items.filter((x) => OPEN.includes(x.status));
  const allSel = selectable.length > 0 && selectable.every((x) => selected.has(x.id));
  const someSel = !allSel && selectable.some((x) => selected.has(x.id));
  const selValue = items.filter((x) => selected.has(x.id)).reduce((s, x) => s + x.netAmount, 0);
  const bookers = options ? new Set(options.routes.map((r) => r.booker?.id).filter(Boolean)).size : 0;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const runCheck = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy("check");
    try {
      const res = await checkBookingStock(ids);
      const sh = res.filter((b) => b.shortLineCount > 0).length;
      toast(`${res.length} order${res.length === 1 ? "" : "s"} checked · ${res.length - sh} fully in stock${sh ? ` · ${sh} with shortages` : ""}`, { tone: sh ? "warn" : "good" });
      reload();
      setRev((n) => n + 1);
    } catch (e) {
      toast(errMsg(e, "Could not check stock"), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  /** Converts bookings to posted wholesale invoices; the toast reports invoices, held bookings and back-ordered lines. */
  const runConvert = async (ids: string[], partial: boolean) => {
    if (!ids.length) return;
    setBusy("convert");
    setFailed(null);
    try {
      const r = await convertBookings(ids, partial);
      const made = r.invoices.length;
      const parts = [`${made} invoice${made === 1 ? "" : "s"} created`];
      if (r.held.length) parts.push(`${r.held.length} held`);
      if (r.backorderLines) parts.push(`${r.backorderLines} line${r.backorderLines === 1 ? "" : "s"} to back-orders`);
      if (r.failed.length) parts.push(`${r.failed.length} failed`);
      toast(parts.join(" · "), {
        tone: r.failed.length && !made ? "danger" : r.held.length || r.failed.length ? "warn" : "good", ms: 7000,
        action: r.backorderLines ? { label: "Back-orders", onClick: () => router.push("/wholesale/backorders") } : undefined,
      });
      if (r.failed.length) setFailed(r.failed.map((f) => ({ docNo: f.docNo, message: f.message })));
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
      reload();
      setRev((n) => n + 1);
    } catch (e) {
      toast(errMsg(e, "Could not convert the bookings"), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const rowClick = (e: MouseEvent<HTMLTableRowElement>, id: string) => {
    if ((e.target as HTMLElement).closest("input,button,a,label,.ws2-c-cb")) return;
    setOpenId(id);
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <div className="ws2-head">
        <span className="ws2-head-ic"><Smartphone /></span>
        <div className="ws2-head-t">
          <div className="eyebrow">Wholesale / Bookings</div>
          <h1>Order Bookings <Badge tone="neutral">Field bookings</Badge></h1>
          <p>Orders taken in the field by bookers. Check stock, then convert to invoices in bulk. Shortages become back-orders.</p>
        </div>
        <div className="ws2-head-btns">
          <ButtonLink href="/wholesale/backorders" icon={<Hourglass />}>Back-orders</ButtonLink>
          <Button icon={<RefreshCw />} disabled title="Syncing from the booker app isn’t available yet">Sync app</Button>
          {can.create && <Button variant="primary" icon={<Plus />} disabled={!options} onClick={() => setEditor({ b: null })}>New booking</Button>}
        </div>
      </div>
      {optErr && <div className="mb"><Banner tone="warn" title="Some lists didn’t load">{optErr} — filters and new bookings are unavailable until you reload.</Banner></div>}

      <div className="kpi-grid c4 mb">
        <Kpi title="Orders today" icon={<Smartphone />} value={k?.today ?? "—"} sub={k ? `${k.yesterday} from yesterday` : " "} />
        <Kpi title="Booked value today" icon={<Banknote />} tone="teal" value={k ? rs(k.todayValue) : "—"} sub={options ? `${options.routes.length} route${options.routes.length === 1 ? "" : "s"} · ${bookers} booker${bookers === 1 ? "" : "s"}` : " "} />
        <Kpi title="Awaiting conversion" icon={<Hourglass />} tone="yellow" value={k?.awaiting ?? "—"} sub={k ? `${k.partial} partial · ${k.backorderLines} back-order lines` : " "} />
        <Kpi title="GPS verified" icon={<MapPinCheck />} tone="blue" value={k ? (k.gpsVerifiedPct === null ? "—" : `${Math.round(k.gpsVerifiedPct)}%`) : "—"} sub="Booked at the shop pin" />
      </div>

      <div className="panel flush ws2-o-panel">
        <div className="ws2-o-filters">
          <div className="chips">
            {CHIPS.map((c) => <button key={c.label} type="button" className={cn(status === c.status && "active")} onClick={() => resetPage(setStatus)(c.status)}>{c.label}<i>{data ? chipCount(data.counts, c.status) : 0}</i></button>)}
          </div>
          <span className="spacer" />
          <select value={booker} onChange={(e) => resetPage(setBooker)(e.target.value)} aria-label="Booker" disabled={!options}>
            <option value="">All bookers</option>
            {options?.employees.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <select value={route} onChange={(e) => resetPage(setRoute)(e.target.value)} aria-label="Route" disabled={!options}>
            <option value="">All routes</option>
            {options?.routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
          </select>
          <select value={date} onChange={(e) => resetPage(setDate)(e.target.value)} aria-label="Date">
            <option value="">All dates</option>
            <option value={days.today}>Today · {dateLabel(days.today).slice(0, 6)}</option>
            <option value={days.yesterday}>Yesterday · {dateLabel(days.yesterday).slice(0, 6)}</option>
          </select>
        </div>
        {can.approve && (
          <div className={cn("ws2-o-actbar", selected.size > 0 && "on")}>
            <label className="ws2-chk">
              <input type="checkbox" checked={allSel} ref={(el) => { if (el) el.indeterminate = someSel; }} disabled={!selectable.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(selectable.map((x) => x.id)) : new Set())} />
              <span>{selected.size ? <><b>{selected.size}</b> selected · {rs(selValue)}</> : "Select all"}</span>
            </label>
            <span className="spacer" />
            <Switch className="ws2-sw" label="Allow partial" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} />
            <button type="button" className={cn("btn secondary sm ws2-progress-btn", busy === "check" && "ws2-busy")} disabled={!selected.size || !!busy} onClick={runCheck}
              style={{ "--ws2-ms": `${600 + selected.size * 150}ms` } as CSSProperties}>
              <PackageSearch /><span>{busy === "check" ? "Checking…" : "Check stock"}</span><em />
            </button>
            <button type="button" className={cn("btn primary sm ws2-progress-btn", busy === "convert" && "ws2-busy")} disabled={!selected.size || !!busy} onClick={() => runConvert([...selected], allowPartial)}
              style={{ "--ws2-ms": `${selected.size * 400}ms` } as CSSProperties}>
              <FileCheck2 /><span>{busy === "convert" ? "Converting…" : "Convert to invoices"}</span><em />
            </button>
          </div>
        )}
        {failed && failed.length > 0 && (
          <div style={{ padding: "12px 16px 0" }}>
            <Banner tone="warn" title={`${failed.length} booking${failed.length === 1 ? " was" : "s were"} not converted`}
              action={<button type="button" className="icon-btn-sm" aria-label="Dismiss" onClick={() => setFailed(null)}><X /></button>}>
              {failed.map((f) => <span key={f.docNo} style={{ display: "block" }}><b>{f.docNo}</b> — {f.message}</span>)}
            </Banner>
          </div>
        )}
        {error && data && <div style={{ padding: "12px 16px 0" }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div>}
        {!data ? <Skeleton style={{ height: 420 }} /> : !items.length ? (
          <EmptyState icon={<Inbox />} title={filtered ? "No bookings match" : "No order bookings yet"}
            description={filtered ? "Clear a filter to see more." : "Bookings taken in the field appear here. Add one by hand with New booking."}
            action={!filtered && can.create && options ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ b: null })}>New booking</Button> : undefined} />
        ) : (
          <div className="ws2-o-wrap">
            <table className="tbl ws2-o-tbl">
              <thead><tr>
                {can.approve && <th className="ws2-c-cb" />}
                <th>Order</th><th>Booker</th><th>Shop</th><th>Route</th><th className="num">Lines</th><th className="num">Amount</th><th>Location</th><th>Stock</th><th>Status</th>
              </tr></thead>
              <tbody className="ws2-stag">
                {items.map((x, i) => (
                  <tr key={x.id} className={cn(selected.has(x.id) && "sel", `st-${x.status.toLowerCase()}`, busy && selected.has(x.id) && "ws2-run")} style={{ "--i": i } as CSSProperties}
                    onClick={(e) => rowClick(e, x.id)}>
                    {can.approve && (
                      <td className="ws2-c-cb"><input type="checkbox" aria-label={`Select ${x.docNo}`} checked={selected.has(x.id)} disabled={!OPEN.includes(x.status)} onChange={() => toggle(x.id)} /></td>
                    )}
                    <td><b className="ws2-ono">{x.docNo}</b><small>{dayWord(x.docDate, days)} · {hhmm(x.bookedAt)}</small></td>
                    <td><div className="ws2-who"><span className="avatar sm">{initials(x.booker?.name ?? "?")}</span><span>{x.booker?.name ?? "—"}</span></div></td>
                    <td><b>{x.customer.name}</b><small>{x.customer.area ?? x.customer.code}{x.note ? <> · <span className="ws2-note"><MessageSquareText />{x.note}</span></> : null}</small></td>
                    <td><span className="ws2-rt" title={x.route.name}>{x.route.code}</span></td>
                    <td className="num">{x.lineCount}</td>
                    <td className="num"><b>{n0(x.netAmount)}</b></td>
                    <td><Gps b={x} /></td>
                    <td className="ws2-c-stk">{busy === "check" && selected.has(x.id) ? <span className="ws2-muted ws2-nc"><span className="ws2-spin" />Checking…</span> : <StockCell b={x} options={options} />}</td>
                    <td className="ws2-c-st">
                      {busy === "convert" && selected.has(x.id) ? <span className="ws2-muted ws2-nc"><span className="ws2-spin" />Posting…</span> : <StatusBadge status={x.status} />}
                      {x.invoice && <small><Link href={`/sales/invoices/${x.invoice.id}`}><code className="ws2-code">{x.invoice.docNo}</code></Link></small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > PAGE && (
          <div className="table-foot">
            <span>Showing {(page - 1) * PAGE + 1}–{(page - 1) * PAGE + items.length} of {data.total}</span>
            <div className="pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹</button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => Math.min(Math.max(1, page - 2), Math.max(1, pages - 4)) + i).map((x) => <button key={x} type="button" className={cn(x === page && "active")} onClick={() => setPage(x)}>{x}</button>)}
              <button type="button" disabled={page >= pages} onClick={() => setPage((x) => x + 1)}>›</button>
            </div>
          </div>
        )}
      </div>

      <BookingDrawer key={`${openId ?? "none"}-${rev}`} id={openId} can={can} options={options} days={days} busy={busy === "convert"} onClose={() => setOpenId(null)}
        onEdit={(b) => { setOpenId(null); setEditor({ b }); }} onCancel={setCancelling} onDelete={setDel}
        onConvert={(b) => runConvert([b.id], b.allowPartial ?? allowPartial)} />
      {editor && options && (
        <BookingEditor b={editor.b} options={options} onClose={() => setEditor(null)}
          onSaved={(b, created) => { setEditor(null); toast(`${b.docNo} ${created ? "booked" : "saved"}`, { tone: "good" }); setOpenId(b.id); setRev((n) => n + 1); reload(); }} />
      )}
      <ReasonModal key={cancelling ? cancelling.id : "none"} open={!!cancelling} title={cancelling ? `Cancel ${cancelling.docNo}` : ""}
        subtitle="The booking is closed and will not be invoiced." label="Why is this booking cancelled?" confirm="Cancel booking" onClose={() => setCancelling(null)}
        run={async (reason) => {
          if (!cancelling) return;
          const r = await cancelBooking(cancelling.id, cancelling.rowVersion, reason);
          setCancelling(null);
          toast(`${r.docNo} cancelled`, { tone: "good" });
          setRev((n) => n + 1);
          reload();
        }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} danger busy={delBusy} title={`Delete ${del?.docNo ?? ""}?`} confirmLabel="Delete"
        onConfirm={async () => {
          if (!del) return;
          setDelBusy(true);
          try { await deleteBooking(del.id, del.rowVersion); toast(`${del.docNo} deleted`, { tone: "good" }); setDel(null); setOpenId(null); reload(); }
          catch (e) { toast(errMsg(e, "Could not delete the booking"), { tone: "danger" }); }
          finally { setDelBusy(false); }
        }}>
        The booking and its lines are removed. Its number is not reused.
      </ConfirmDialog>
    </>
  );
}

// ================================================================ detail drawer
type Tab = "details" | "history";

function LineStock({ b, l }: { b: OrderBooking; l: OrderBooking["lines"][number] }) {
  const ctn = l.item.ctn;
  if (b.status === "CANCELLED") return <span className="ws2-dash">—</span>;
  if (b.status === "CONVERTED" || b.status === "PARTIAL") {
    return (
      <>
        {l.invoicedQty > 0 && <span className="ws2-stk ok"><CircleCheck />Invoiced {qtyStr(l.invoicedQty, ctn)}</span>}
        {l.backorderQty > 0 && <span className="ws2-stk bad" style={{ display: "flex" }}><Hourglass />{qtyStr(l.backorderQty, ctn)} back-ordered</span>}
        {!l.invoicedQty && !l.backorderQty && <span className="ws2-dash">—</span>}
      </>
    );
  }
  if (l.availableQty === null) return <span className="ws2-muted ws2-nc"><CircleDashed />Not checked</span>;
  if (l.shortQty <= 0) return <span className="ws2-stk ok"><CircleCheck />{qtyStr(l.availableQty, ctn)} available</span>;
  return <span className="ws2-stk bad"><TriangleAlert />{l.availableQty > 0 ? `Only ${qtyStr(l.availableQty, ctn)} · ${qtyStr(l.shortQty, ctn)} short` : "Out of stock"}</span>;
}

function BookingDrawer({ id, can, options, days, busy, onClose, onEdit, onCancel, onDelete, onConvert }: {
  id: string | null; can: Can; options: WholesaleOptions | null; days: { today: string; yesterday: string }; busy: boolean; onClose: () => void;
  onEdit: (b: OrderBooking) => void; onCancel: (b: OrderBooking) => void; onDelete: (b: OrderBooking) => void; onConvert: (b: OrderBooking) => void;
}) {
  const [b, setB] = useState<OrderBooking | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("details");
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getBooking(id).then((x) => { if (!cancelled) { setB(x); setErr(null); } }).catch((e: unknown) => !cancelled && setErr(errMsg(e, "Could not load the booking")));
    return () => { cancelled = true; };
  }, [id, n]);

  const tier = b ? options?.tiers.find((t) => t.code === b.priceTier)?.name ?? b.priceTier : "";
  const open = !!b && OPEN.includes(b.status);
  const foot = b ? (
    <>
      <button type="button" className="btn secondary" onClick={onClose}>Close</button>
      {b.status === "NEW" && can.delete && <Button icon={<Trash2 />} disabled={busy} onClick={() => onDelete(b)}>Delete</Button>}
      {b.status === "NEW" && can.edit && <Button icon={<Pencil />} disabled={busy || !options} onClick={() => onEdit(b)}>Edit</Button>}
      {open && can.edit && <Button icon={<Ban />} disabled={busy} onClick={() => onCancel(b)}>Cancel</Button>}
      {open && can.approve && (
        <button type="button" className={cn("btn primary ws2-progress-btn", busy && "ws2-busy")} disabled={busy} onClick={() => onConvert(b)}>
          <FileCheck2 /><span>{busy ? "Converting…" : "Convert to invoice"}</span><em />
        </button>
      )}
    </>
  ) : undefined;

  return (
    <Drawer open={!!id} onClose={onClose} wide title={b ? b.docNo : "Order booking"} subtitle={b ? `Field booking · ${b.booker?.name ?? "—"}` : undefined} foot={foot}>
      {err ? <ErrorState message={err} onRetry={() => { setErr(null); setN((x) => x + 1); }} /> : !b ? <Skeleton style={{ height: 420 }} /> : (
        <>
          <div className="ws2-bd-hero">
            <span className="avatar lg">{initials(b.customer.name)}</span>
            <div>
              <h3>{b.customer.name}</h3>
              <p>{b.customer.code}{b.customer.area ? ` · ${b.customer.area}` : ""} · {b.route.code} · {tier}</p>
              <div className="row"><StatusBadge status={b.status} /><Gps b={b} /></div>
            </div>
          </div>
          <div className="ws2-bd-meta">
            <div><small>Booker</small><b>{b.booker?.name ?? "—"}</b></div>
            <div><small>Booked</small><b>{dayWord(b.docDate, days)} {hhmm(b.bookedAt)}</b></div>
            <div><small>Lines</small><b>{b.lineCount}</b></div>
            <div><small>Amount</small><b>{rs(b.netAmount)}</b></div>
          </div>
          {b.note && <div className="ws2-bd-note"><MessageSquareText />{b.note}</div>}
          {b.status === "CANCELLED" && <div className="mb"><Banner tone="danger" title="Cancelled">{b.cancelReason ?? "No reason given"}{b.cancelledAt ? ` · ${dateLabel(b.cancelledAt)}` : ""}</Banner></div>}
          {b.invoice && (
            <div className="mb"><Banner tone={b.status === "PARTIAL" ? "warn" : "good"} title={b.status === "PARTIAL" ? "Partly invoiced" : "Invoiced"}>
              <Link className="link" href={`/sales/invoices/${b.invoice.id}`}>{b.invoice.docNo}</Link>{b.convertedAt ? ` · ${dateLabel(b.convertedAt)}` : ""}
              {b.status === "PARTIAL" ? " · the short lines are waiting in back-orders." : ""}
            </Banner></div>
          )}
          <Tabs<Tab> items={[{ key: "details", label: "Details" }, { key: "history", label: "History" }]} active={tab} onChange={setTab} />
          {tab === "details" && (
            <>
              <div className="table-wrap mt">
                <table className="tbl ws2-bd-tbl">
                  <thead><tr><th>Item</th><th className="num">CTN</th><th className="num">PCS</th><th className="num">Rate</th><th className="num">Amount</th><th>Stock</th></tr></thead>
                  <tbody>
                    {b.lines.map((l) => (
                      <tr key={l.id}>
                        <td><b>{l.item.name}</b><small>{l.item.sku} · Ctn {l.item.ctn}</small></td>
                        <td className="num">{l.qtyCtn || "—"}</td>
                        <td className="num">{l.qtyLoose || "—"}</td>
                        <td className="num">{n2(l.rate)}</td>
                        <td className="num"><b>{n0(l.netAmount)}</b></td>
                        <td><LineStock b={b} l={l} /></td>
                      </tr>
                    ))}
                    <tr className="total"><td colSpan={4}>GST {n2(b.taxAmount)}</td><td className="num">{n2(b.netAmount)}</td><td /></tr>
                  </tbody>
                </table>
              </div>
              <div className="ws2-bd-map">
                <span className="ws2-bd-pin"><MapPin /></span>
                <div>
                  <b>{b.gpsVerified ? "Booked at the shop" : b.gpsOffsetM !== null ? "Booked away from the shop" : "No location recorded"}</b>
                  <small>{b.gpsVerified ? "At the saved shop pin" : b.gpsOffsetM !== null ? `${offLabel(b.gpsOffsetM).replace(" off", "")} from the saved pin` : "Entered without a GPS fix"} · {hhmm(b.bookedAt)}</small>
                </div>
              </div>
              {b.allowPartial === false && <p className="muted mt" style={{ fontSize: 12.5 }}>Partial delivery is off for this booking: it is held until every line is in stock.</p>}
            </>
          )}
          {tab === "history" && <div className="mt"><HistoryTab schema="Distribution" table="OrderBookings" id={b.id} /></div>}
        </>
      )}
    </Drawer>
  );
}

// ================================================================ new / edit booking (template-style addition)
type EditLine = { key: string; itemId: string; ctn: string; pcs: string };
let seq = 0;
const blank = (): EditLine => ({ key: `n${++seq}`, itemId: "", ctn: "", pcs: "" });
const num = (s: string) => (s.trim() === "" ? 0 : Number(s) || 0);

function BookingEditor({ b, options: o, onClose, onSaved }: {
  b: OrderBooking | null; options: WholesaleOptions; onClose: () => void; onSaved: (b: OrderBooking, created: boolean) => void;
}) {
  const [customerId, setCustomerId] = useState(b?.customer.id ?? "");
  const [docDate, setDocDate] = useState(b?.docDate ?? isoDay(new Date()));
  const [note, setNote] = useState(b?.note ?? "");
  const [allowPartial, setAllowPartial] = useState(b?.allowPartial ?? true);
  const [lines, setLines] = useState<EditLine[]>(() => (b ? b.lines.map((l) => ({ key: l.id, itemId: l.item.id, ctn: l.qtyCtn ? String(l.qtyCtn) : "", pcs: l.qtyLoose ? String(l.qtyLoose) : "" })) : [blank()]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; fields: Record<string, string> } | null>(null);
  const fe = (key: string) => err?.fields[key];

  const shop = o.shops.find((s) => s.customerId === customerId);
  const tier = shop ? o.tiers.find((t) => t.code === shop.priceTier) : undefined;
  const factor = tier?.rateFactor ?? 1;
  const route = shop?.routeId ? o.routes.find((r) => r.id === shop.routeId) : undefined;
  const calc = lines.map((l) => {
    const p = o.products.find((x) => x.id === l.itemId);
    const rate = p ? tierRate(p, factor) : 0;
    const base = p ? num(l.ctn) * Math.max(1, p.ctn) + num(l.pcs) : 0;
    return { p, rate, amount: base * rate * (1 + (p?.taxRate ?? 0) / 100) };
  });
  const total = calc.reduce((s, c) => s + c.amount, 0);
  const setLine = (key: string, patch: Partial<EditLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    setErr(null);
    const body = {
      customerId, docDate, note: note.trim() || null, allowPartial,
      lines: lines.filter((l) => l.itemId || l.ctn || l.pcs).map((l) => ({ itemId: l.itemId, qtyCtn: num(l.ctn), qtyLoose: num(l.pcs) })),
      ...(b && { rowVersion: b.rowVersion }),
    };
    try {
      const saved = b ? await updateBooking(b.id, body) : await createBooking(body);
      onSaved(saved, !b);
    } catch (e) {
      setErr(fieldErrors(e, "Could not save the booking"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onClose={onClose} wide title={b ? `Edit ${b.docNo}` : "New booking"} subtitle={b ? `${b.customer.name} · new` : "Auto-numbered on save · rates from the shop’s price tier"} foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : b ? "Save booking" : "Book order"}</button>
      </>
    }>
      {err && <div className="mb"><Banner tone="danger" title="Not saved">{err.message}</Banner></div>}
      <FormGrid>
        <Field label="Shop" required error={fe("customerId")}>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Choose…</option>
            {o.shops.map((s) => <option key={s.customerId} value={s.customerId} disabled={!s.routeId}>{s.name} · {s.code}{s.routeId ? "" : " (no route)"}</option>)}
          </select>
        </Field>
        <Field label="Booking date" required error={fe("docDate")}><input type="date" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></Field>
      </FormGrid>
      {shop && (
        <div className="ws2-bf-tier">
          <span className="ws2-rt">{route?.code ?? "—"}</span>
          <span>{route?.name ?? "No route"}{shop.area ? ` · ${shop.area}` : ""}</span>
          <Badge tone="neutral">{tier?.name ?? shop.priceTier}{factor !== 1 ? ` · ×${factor}` : ""}</Badge>
          {(fe("warehouseId") || fe("bookerEmployeeId")) && <small className="text-danger">{fe("warehouseId") ?? fe("bookerEmployeeId")}</small>}
        </div>
      )}
      <div className="table-wrap mt">
        <table className="tbl ws2-bf-tbl">
          <thead><tr><th>Product</th><th className="num">CTN</th><th className="num">PCS</th><th className="num">Rate</th><th className="num">Amount</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const c = calc[i]!;
              return (
                <tr key={l.key}>
                  <td>
                    <select value={l.itemId} onChange={(e) => setLine(l.key, { itemId: e.target.value })} aria-label={`Line ${i + 1} product`}>
                      <option value="">Choose product…</option>
                      {o.products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}
                    </select>
                    {c.p && <small className="muted">Ctn {c.p.ctn} · GST {c.p.taxRate}%</small>}
                    {fe(`lines.${i}.itemId`) && <small className="text-danger">{fe(`lines.${i}.itemId`)}</small>}
                  </td>
                  <td className="num"><input className="num" inputMode="numeric" value={l.ctn} onChange={(e) => setLine(l.key, { ctn: e.target.value })} aria-label={`Line ${i + 1} cartons`} /></td>
                  <td className="num">
                    <input className="num" inputMode="numeric" value={l.pcs} onChange={(e) => setLine(l.key, { pcs: e.target.value })} aria-label={`Line ${i + 1} pieces`} />
                    {(fe(`lines.${i}.qtyLoose`) || fe(`lines.${i}.qtyCtn`)) && <small className="text-danger">{fe(`lines.${i}.qtyLoose`) ?? fe(`lines.${i}.qtyCtn`)}</small>}
                  </td>
                  <td className="num">{c.p ? n2(c.rate) : "—"}</td>
                  <td className="num"><b>{c.p ? n0(c.amount) : "—"}</b></td>
                  <td className="num">
                    <button type="button" className="icon-btn-sm" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 /></button>
                  </td>
                </tr>
              );
            })}
            <tr className="total"><td colSpan={4}>Total incl. GST</td><td className="num">{rs(total)}</td><td /></tr>
          </tbody>
        </table>
      </div>
      {fe("lines") && <small className="text-danger" style={{ display: "block", marginTop: 6 }}>{fe("lines")}</small>}
      <Button size="sm" icon={<Plus />} className="ws2-bf-add" onClick={() => setLines((ls) => [...ls, blank()])}>Add line</Button>
      <div className="mt">
        <FormGrid cols={1}>
          <Field label="Note for the delivery" error={fe("note")}><textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Deliver before Jumma" /></Field>
          <CheckField label="Allow partial delivery (short lines go to back-orders)" checked={allowPartial} onChange={(e) => setAllowPartial(e.target.checked)} />
        </FormGrid>
      </div>
    </Drawer>
  );
}
