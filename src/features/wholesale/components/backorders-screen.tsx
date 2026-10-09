"use client";

import {
  Ban, Banknote, CalendarClock, ChevronRight, ChevronsUpDown, ClockAlert, Crown, FileCheck2, Hourglass, ListTodo, Package, PackageCheck, PackageOpen, PartyPopper,
  Scale, Smartphone, Split, Store, Truck, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import type { BackOrder, BackOrderList, IncomingStock, WholesaleOptions } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { Banner, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { errMsg, initials, rs } from "@/features/sales/components/quotations-screen";
import { ApiError } from "@/lib/api/errors";
import { allocateBackOrders, cancelBackOrders, convertBackOrders, incomingStock, listBackOrders, wholesaleOptions } from "../api";

type Can = { edit: boolean; approve: boolean };
type View = "item" | "cust";
type Policy = "FEFO" | "PRIORITY" | "PRO_RATA";
const OPEN_ALLOC = ["WAITING", "PART_ALLOCATED"];
const REASONS = [
  { code: "CUSTOMER_NO_LONGER_NEEDS", label: "Customer no longer needs it" },
  { code: "DISCONTINUED", label: "Product discontinued" },
  { code: "OTHER_DISTRIBUTOR", label: "Supplied by another distributor" },
  { code: "PRICE_DISAGREEMENT", label: "Price disagreement" },
];

// ---------------------------------------------------------------- helpers
const n0 = (n: number) => Math.round(n).toLocaleString("en-US");
/** Template qtyStr: "3 ctn + 4", or pieces when the product has no carton size. */
const qtyStr = (q: number, ctn: number) => {
  const p = Math.max(1, ctn || 1);
  const v = Math.round(q);
  if (p === 1) return `${n0(v)} pcs`;
  const c = Math.floor(v / p), r = v % p;
  return c ? `${n0(c)} ctn${r ? ` + ${r}` : ""}` : `${r} pcs`;
};
const AgeChip = ({ days }: { days: number }) => <span className={cn("ws2-age", days > 10 ? "bad" : days > 4 && "warn")}>{days ? `${days}d` : "today"}</span>;
function BoStatus({ b }: { b: BackOrder }) {
  if (b.status === "READY") return <span className="badge good"><PackageCheck />Ready</span>;
  if (b.status === "PART_ALLOCATED") return <Badge tone="info">Part allocated</Badge>;
  return <Badge tone="neutral">Waiting</Badge>;
}
function Kpi({ title, icon, tone, value, sub }: { title: string; icon: ReactNode; tone?: string; value: ReactNode; sub: ReactNode }) {
  return <div className="kpi"><div className="kpi-top"><span>{title}</span><span className={cn("icon-well", tone)}>{icon}</span></div><strong>{value}</strong><small>{sub}</small></div>;
}
const tierOf = (o: WholesaleOptions | null, customerId: string) => {
  const code = o?.shops.find((s) => s.customerId === customerId)?.priceTier;
  return code ? o!.tiers.find((t) => t.code === code) ?? { code, name: code, rateFactor: 1, allocationRank: 999 } : null;
};

/** Client preview of Distribution.backOrderAllocate: oldest first, or price-tier rank then age, or pro-rata floor(share). */
function allocPlan(f: IncomingStock, items: BackOrder[], policy: Policy, o: WholesaleOptions | null) {
  const cand = items.filter((b) => b.item.id === f.item.id && OPEN_ALLOC.includes(b.status) && b.pendingQty > b.allocatedQty)
    .map((b) => ({ b, need: b.pendingQty - b.allocatedQty, give: 0, rank: tierOf(o, b.customer.id)?.allocationRank ?? 999 }));
  cand.sort((x, y) => (policy === "PRIORITY" ? x.rank - y.rank : 0) || x.b.backorderDate.localeCompare(y.b.backorderDate));
  const need = cand.reduce((s, c) => s + c.need, 0);
  const pool = Math.min(f.freeQty, need);
  let left = pool;
  for (const c of cand) {
    if (left <= 0) break;
    c.give = policy === "PRO_RATA" ? Math.min(c.need, Math.floor((pool * c.need) / need)) : Math.min(c.need, left);
    left -= c.give;
  }
  return { cand, need, given: pool - left };
}

// ================================================================ screen
/** Template app/wholesale/backorders (4D-wholesale.html + 9H-wholesale.js): KPIs, grouped back-order lines, incoming-stock feed, allocate / cancel / convert. */
export function BackOrdersScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [data, setData] = useState<BackOrderList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [feed, setFeed] = useState<IncomingStock[] | null>(null);
  const [feedErr, setFeedErr] = useState<string | null>(null);
  const [options, setOptions] = useState<WholesaleOptions | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>("item");
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState(false);
  const [failed, setFailed] = useState<{ customer: string; message: string }[] | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [alloc, setAlloc] = useState<IncomingStock | null>(null);
  const itemsRef = useRef<BackOrder[]>([]);
  const canSelect = can.edit || can.approve;

  useEffect(() => {
    wholesaleOptions().then(setOptions).catch(() => setOptions(null));
  }, []);
  useEffect(() => {
    let cancelled = false;
    listBackOrders({ pageSize: 500 })
      .then((l) => {
        if (cancelled) return;
        setData(l);
        setError(null);
        itemsRef.current = l.items;
        const ids = new Set(l.items.map((b) => b.id));
        setSel((s) => new Set([...s].filter((id) => ids.has(id))));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load back-orders" }));
    incomingStock()
      .then((f) => { if (!cancelled) { setFeed(f); setFeedErr(null); } })
      .catch((e: unknown) => !cancelled && setFeedErr(errMsg(e, "Could not load incoming stock")));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const groups = useMemo(() => {
    const m = new Map<string, BackOrder[]>();
    for (const b of items) {
      const key = view === "item" ? b.item.id : b.customer.id;
      m.set(key, [...(m.get(key) ?? []), b]);
    }
    const val = (g: BackOrder[]) => g.reduce((s, b) => s + b.value, 0);
    return [...m.entries()].map(([key, g]) => ({ key, rows: [...g].sort((a, b) => b.ageDays - a.ageDays), value: val(g) })).sort((a, b) => b.value - a.value);
  }, [items, view]);
  // First group opens by default (template); null = not chosen yet.
  const openSet = open ?? new Set(groups[0] ? [groups[0].key] : []);
  const allOpen = groups.length > 0 && groups.every((g) => openSet.has(g.key));
  const toggleOpen = (key: string) => setOpen(() => { const n = new Set(openSet); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const toggleSel = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });
  const selected = items.filter((b) => sel.has(b.id));
  const ready = selected.filter((b) => b.allocatedQty > 0);
  const routes = new Set(items.map((b) => b.route?.id).filter(Boolean)).size;
  const k = data?.kpis;

  const convert = async () => {
    if (!ready.length) { toast("None of the selected lines have stock allocated yet · allocate an arrival first", { tone: "warn" }); return; }
    setConverting(true);
    setFailed(null);
    try {
      const r = await convertBackOrders(ready.map((b) => b.id));
      const n = r.invoices.length;
      const waiting = selected.length - ready.length;
      toast(`${n} invoice${n === 1 ? "" : "s"} created${n ? ` (${r.invoices.map((i) => i.docNo).join(", ")})` : ""} for ${ready.length} back-order line${ready.length === 1 ? "" : "s"}${waiting ? ` · ${waiting} still waiting for stock` : ""}${r.failed.length ? ` · ${r.failed.length} failed` : ""}`,
        { tone: r.failed.length ? (n ? "warn" : "danger") : "good", ms: 7000 });
      if (r.failed.length) setFailed(r.failed.map((f) => ({ customer: f.customer, message: f.message })));
      toggleSel(ready.map((b) => b.id), false);
      reload();
    } catch (e) {
      toast(errMsg(e, "Could not invoice the back-orders"), { tone: "danger" });
    } finally {
      setConverting(false);
    }
  };

  if (error && !data) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  return (
    <>
      <div className="ws2-head">
        <span className="ws2-head-ic"><Hourglass /></span>
        <div className="ws2-head-t">
          <div className="eyebrow">Wholesale / Back-orders</div>
          <h1>Back-orders</h1>
          <p>Pending quantities from partial deliveries. Allocate as stock arrives, then invoice in one go.</p>
        </div>
        <div className="ws2-head-btns">
          <ButtonLink href="/wholesale/bookings" icon={<Smartphone />}>Order bookings</ButtonLink>
        </div>
      </div>

      <div className="kpi-grid c5 mb">
        <Kpi title="Pending lines" icon={<ListTodo />} value={k?.pendingLines ?? "—"} sub={k ? `${k.products} product${k.products === 1 ? "" : "s"}` : " "} />
        <Kpi title="Pending value" icon={<Banknote />} tone="teal" value={k ? rs(k.pendingValue) : "—"} sub="at tier rates incl. GST" />
        <Kpi title="Customers waiting" icon={<Store />} tone="blue" value={k?.customers ?? "—"} sub={data ? `across ${routes} route${routes === 1 ? "" : "s"}` : " "} />
        <Kpi title="Oldest pending" icon={<ClockAlert />} tone={k && k.oldestDays > 10 ? "red" : "yellow"} value={k ? `${k.oldestDays} day${k.oldestDays === 1 ? "" : "s"}` : "—"}
          sub={k ? (k.oldestDays > 10 ? <span style={{ color: "var(--danger)" }}>needs attention</span> : "within SLA") : " "} />
        <Kpi title="Ready to invoice" icon={<PackageCheck />} tone="lime" value={k?.ready ?? "—"} sub="stock allocated" />
      </div>

      <div className="ws2-bo-grid">
        <div className="panel flush ws2-bo-main">
          <div className="ws2-o-filters">
            <div className="seg" role="tablist" aria-label="Group by">
              <button type="button" className={cn(view === "item" && "active")} onClick={() => { setView("item"); setOpen(null); }}><Package />By item</button>
              <button type="button" className={cn(view === "cust" && "active")} onClick={() => { setView("cust"); setOpen(null); }}><Store />By customer</button>
            </div>
            <span className="spacer" />
            <button type="button" className="ws2-linkbtn" disabled={!groups.length} onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}>
              <ChevronsUpDown />{allOpen ? "Collapse all" : "Expand all"}
            </button>
          </div>
          {canSelect && (
            <div className={cn("ws2-o-actbar", sel.size > 0 && "on")}>
              <span className="ws2-r-selt">{sel.size ? <><b>{sel.size}</b> line{sel.size === 1 ? "" : "s"} selected · {ready.length} with stock allocated</> : "Select lines to invoice or cancel"}</span>
              <span className="spacer" />
              {can.edit && <button type="button" className="btn ghost sm" disabled={!sel.size || converting} onClick={() => setCancelOpen(true)}><Ban />Cancel lines</button>}
              {can.approve && (
                <button type="button" className={cn("btn primary sm ws2-progress-btn", converting && "ws2-busy")} disabled={!sel.size || converting} onClick={convert}
                  style={{ "--ws2-ms": `${600 + ready.length * 250}ms` } as CSSProperties}>
                  <FileCheck2 /><span>{converting ? "Invoicing…" : "Convert to invoices"}</span><em />
                </button>
              )}
            </div>
          )}
          {failed && failed.length > 0 && (
            <div style={{ padding: "12px 12px 0" }}>
              <Banner tone="warn" title={`${failed.length} shop${failed.length === 1 ? " was" : "s were"} not invoiced`}
                action={<button type="button" className="icon-btn-sm" aria-label="Dismiss" onClick={() => setFailed(null)}><X /></button>}>
                {failed.map((f, i) => <span key={i} style={{ display: "block" }}><b>{f.customer}</b> — {f.message}</span>)}
              </Banner>
            </div>
          )}
          {error && data && <div style={{ padding: "12px 12px 0" }}><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div>}
          <div className="ws2-bo-list">
            {!data ? <Skeleton style={{ height: 360 }} /> : !groups.length ? (
              <div className="ws2-paste-empty"><PartyPopper /><b>No back-orders</b><small>Every order has been delivered in full.</small></div>
            ) : groups.map((g, gi) => {
              const first = g.rows[0]!;
              const isOpen = openSet.has(g.key);
              const ids = g.rows.map((b) => b.id);
              const allSel = ids.every((id) => sel.has(id));
              const someSel = !allSel && ids.some((id) => sel.has(id));
              const oldest = Math.max(...g.rows.map((b) => b.ageDays));
              const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleOpen(g.key); } };
              return (
                <div key={g.key} className={cn("ws2-bo-g", isOpen && "open")} style={{ "--i": gi } as CSSProperties}>
                  <div className="ws2-bo-gh" role="button" tabIndex={0} aria-expanded={isOpen} onKeyDown={onKey}
                    onClick={(e) => { if (!(e.target as HTMLElement).closest("label.ws2-c-cb")) toggleOpen(g.key); }}>
                    {canSelect && (
                      <label className="ws2-c-cb">
                        <input type="checkbox" aria-label="Select group" checked={allSel} ref={(el) => { if (el) el.indeterminate = someSel; }}
                          onChange={(e) => { toggleSel(ids, e.target.checked); if (e.target.checked && !isOpen) toggleOpen(g.key); }} />
                      </label>
                    )}
                    <ChevronRight className="ws2-chev" />
                    {view === "item" ? (
                      <>
                        <span className="icon-well"><Package /></span>
                        <div className="ws2-bo-gt"><b>{first.item.name}</b><small>{first.item.sku} · Ctn {first.item.ctn}</small></div>
                        <div className="ws2-bo-gm"><small>Pending</small><b>{qtyStr(g.rows.reduce((s, b) => s + b.pendingQty, 0), first.item.ctn)}</b></div>
                      </>
                    ) : (
                      <>
                        <span className="avatar">{initials(first.customer.name)}</span>
                        <div className="ws2-bo-gt"><b>{first.customer.name}</b><small>{first.customer.code}{first.customer.area ? ` · ${first.customer.area}` : ""}{first.route ? ` · ${first.route.code}` : ""}</small></div>
                        <div className="ws2-bo-gm"><small>Products</small><b>{new Set(g.rows.map((b) => b.item.id)).size}</b></div>
                      </>
                    )}
                    <div className="ws2-bo-gm"><small>{view === "item" ? "Customers" : "Lines"}</small><b>{view === "item" ? new Set(g.rows.map((b) => b.customer.id)).size : g.rows.length}</b></div>
                    <div className="ws2-bo-gm"><small>Value</small><b>{rs(g.value)}</b></div>
                    <div className="ws2-bo-gm"><small>Oldest</small><AgeChip days={oldest} /></div>
                  </div>
                  <div className="ws2-bo-gb"><div>
                    {g.rows.map((b) => {
                      const pct = b.pendingQty > 0 ? Math.min(100, (b.allocatedQty / b.pendingQty) * 100) : 0;
                      const tier = tierOf(options, b.customer.id);
                      const src = b.allocations.filter((a) => a.status === "ALLOCATED").map((a) => a.batchNo ?? a.grnNo).join(" + ");
                      return (
                        <div key={b.id} className={cn("ws2-bo-row", sel.has(b.id) && "sel", converting && sel.has(b.id) && b.allocatedQty > 0 && "ws2-run")}>
                          {canSelect ? <label className="ws2-c-cb"><input type="checkbox" aria-label="Select back-order line" checked={sel.has(b.id)} onChange={(e) => toggleSel([b.id], e.target.checked)} /></label> : <span />}
                          <div className="ws2-bo-who">
                            {view === "item"
                              ? <><b>{b.customer.name}</b><small>{b.customer.code}{tier ? ` · ${tier.name}` : ""} · <code className="ws2-code">{b.source.docNo ?? "—"}</code></small></>
                              : <><b>{b.item.name}</b><small>{b.item.sku} · <code className="ws2-code">{b.source.docNo ?? "—"}</code></small></>}
                          </div>
                          <div className="ws2-bo-q"><b>{qtyStr(b.pendingQty, b.item.ctn)}</b><small>{n0(b.pendingQty)} pcs{b.lastInvoice ? <> · <Link href={`/sales/invoices/${b.lastInvoice.id}`}>{b.lastInvoice.docNo}</Link></> : ""}</small></div>
                          <div className="ws2-bo-al"><span className="ws2-albar"><i style={{ width: `${pct}%` }} /></span><small>{b.allocatedQty ? `${n0(b.allocatedQty)} allocated${src ? ` · ${src}` : ""}` : "Nothing allocated"}</small></div>
                          <AgeChip days={b.ageDays} />
                          <span className="ws2-bo-st"><BoStatus b={b} /></span>
                        </div>
                      );
                    })}
                  </div></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel ws2-feed">
          <div className="ws2-bk-head ws2-nopad"><div><h3>Incoming stock</h3><p>Posted goods receipts for back-ordered items</p></div><span className="spacer" />{!!feed?.length && <Badge tone="neutral">{feed.length}</Badge>}</div>
          {feedErr ? <ErrorState message={feedErr} onRetry={reload} /> : !feed ? <Skeleton style={{ height: 240 }} /> : !feed.length ? (
            <div className="ws2-paste-empty"><PackageOpen /><b>Nothing arriving</b><small>Goods receipts for back-ordered items show here once posted.</small></div>
          ) : feed.map((f, i) => {
            const done = f.freeQty <= 0;
            return (
              <div key={f.grnLineId} className={cn("ws2-fd", done && "done")} style={{ "--i": i } as CSSProperties}>
                <span className="ws2-fd-dot" />
                <div className="ws2-fd-b">
                  <div className="ws2-fd-top"><code className="ws2-code">{f.grnNo}</code><small>{f.arrived ? <PackageOpen /> : <Truck />}{dateLabel(f.docDate)}</small></div>
                  <b>{f.item.name}</b>
                  <small>{f.vendor ?? "—"} · <b>{qtyStr(f.acceptedQty, f.item.ctn)}</b>{f.batchNo ? ` · batch ${f.batchNo}` : ""}</small>
                  <div className="ws2-fd-foot">
                    {done ? <span className="badge good"><PackageCheck />Allocated</span>
                      : !f.arrived ? <Badge tone="neutral">In transit</Badge>
                      : f.waitingQty > 0 ? (
                        <>
                          <span className="ws2-fd-need">{f.customersWaiting} waiting · {qtyStr(f.waitingQty, f.item.ctn)}</span>
                          {can.edit && <button type="button" className="btn primary sm" onClick={() => setAlloc(f)}><Split />Allocate</button>}
                        </>
                      ) : <span className="ws2-muted">No back-orders waiting · {qtyStr(f.freeQty, f.item.ctn)} free</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {alloc && (
        <AllocateModal f={alloc} items={items} options={options} onClose={() => setAlloc(null)}
          onDone={(allocated, n) => {
            setAlloc(null);
            setOpen(new Set(view === "item" ? [alloc.item.id] : items.filter((b) => b.item.id === alloc.item.id).map((b) => b.customer.id)));
            toast(`${alloc.grnNo} · ${n0(allocated)} allocated to ${n} back-order${n === 1 ? "" : "s"}`, {
              tone: "good", ms: 7000,
              action: can.approve ? { label: "Select ready", onClick: () => setSel(new Set(itemsRef.current.filter((b) => b.allocatedQty > 0).map((b) => b.id))) } : undefined,
            });
            reload();
          }} />
      )}
      {cancelOpen && (
        <CancelModal ids={[...sel]} onClose={() => setCancelOpen(false)}
          onDone={(n, label) => { setCancelOpen(false); setSel(new Set()); toast(`${n} line${n === 1 ? "" : "s"} cancelled · ${label}`, { tone: "warn" }); reload(); }} />
      )}
    </>
  );
}

// ================================================================ allocate
const POLICIES: { key: Policy; label: string; icon: ReactNode }[] = [
  { key: "FEFO", label: "Oldest first", icon: <CalendarClock /> }, { key: "PRIORITY", label: "Priority tier", icon: <Crown /> }, { key: "PRO_RATA", label: "Pro-rata", icon: <Scale /> },
];

function AllocateModal({ f, items, options, onClose, onDone }: {
  f: IncomingStock; items: BackOrder[]; options: WholesaleOptions | null; onClose: () => void; onDone: (allocated: number, lines: number) => void;
}) {
  const [policy, setPolicy] = useState<Policy>("FEFO");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { cand, need, given } = allocPlan(f, items, policy, options);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await allocateBackOrders({ grnLineId: f.grnLineId, policy });
      onDone(r.allocated, cand.filter((c) => c.give > 0).length);
    } catch (e) {
      setErr(errMsg(e, "Could not allocate the stock"));
      setBusy(false);
    }
  };
  return (
    <Modal open wide onClose={onClose} title={`Allocate ${f.grnNo}`}
      subtitle={`${f.item.name} · ${qtyStr(f.acceptedQty, f.item.ctn)} received${f.vendor ? ` from ${f.vendor}` : ""}${f.batchNo ? ` · batch ${f.batchNo}${f.expiryDate ? ` (exp ${f.expiryDate.slice(0, 7)})` : ""}` : ""}`}
      foot={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className={cn("btn primary ws2-progress-btn", busy && "ws2-busy")} disabled={busy || given <= 0} onClick={go}
            style={{ "--ws2-ms": `${400 + cand.length * 90}ms` } as CSSProperties}>
            <Split /><span>{busy ? "Allocating…" : `Allocate ${n0(given)} unit${given === 1 ? "" : "s"}`}</span><em />
          </button>
        </>
      }>
      {err && <div className="mb"><Banner tone="danger" title="Not allocated">{err}</Banner></div>}
      <div className="ws2-al-bar">
        <span className="ws2-al-lbl">Policy</span>
        <div className="seg" role="tablist" aria-label="Allocation policy">
          {POLICIES.map((p) => <button key={p.key} type="button" className={cn(policy === p.key && "active")} onClick={() => setPolicy(p.key)}>{p.icon}{p.label}</button>)}
        </div>
      </div>
      <div className="ws2-al-sum">
        <div><small>Free on receipt</small><b>{n0(f.freeQty)}</b></div>
        <div><small>Waiting</small><b>{n0(need)}</b></div>
        <div><small>Allocating</small><b className="ws2-good">{n0(given)}</b></div>
        <div><small>Left in stock</small><b>{n0(f.freeQty - given)}</b></div>
      </div>
      {!cand.length ? (
        <div className="ws2-paste-empty"><PackageCheck /><b>No back-orders waiting for this item</b><small>Everything pending is already allocated.</small></div>
      ) : (
        <div className="table-wrap">
          <table className="tbl ws2-al-tbl">
            <thead><tr><th>#</th><th>Customer</th><th>Age</th><th className="num">Pending</th><th>Allocate</th><th className="num">Still due</th></tr></thead>
            <tbody>
              {cand.map((c, i) => {
                const tier = tierOf(options, c.b.customer.id);
                return (
                  <tr key={c.b.id} style={{ "--i": i } as CSSProperties}>
                    <td>{i + 1}</td>
                    <td><b>{c.b.customer.name}</b><small>{tier ? `${tier.name} · ` : ""}<code className="ws2-code">{c.b.source.docNo ?? "—"}</code></small></td>
                    <td><AgeChip days={c.b.ageDays} /></td>
                    <td className="num">{n0(c.need)}</td>
                    <td><div className="ws2-al-cell"><span className="ws2-albar lg"><i style={{ width: `${((c.give / c.need) * 100).toFixed(1)}%` }} /></span><b>{n0(c.give)}</b></div></td>
                    <td className="num">{c.need - c.give ? n0(c.need - c.give) : <span className="ws2-good">0</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

// ================================================================ cancel
function CancelModal({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: (n: number, label: string) => void }) {
  const [reason, setReason] = useState(REASONS[0]!.code);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await cancelBackOrders(ids, reason, note.trim() || undefined);
      onDone(r.cancelled, REASONS.find((x) => x.code === reason)!.label);
    } catch (e) {
      setErr(errMsg(e, "Could not cancel the lines"));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Cancel back-order lines" subtitle={`${ids.length} line${ids.length === 1 ? "" : "s"} will be closed. The customer will not receive these quantities.`}
      foot={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Keep lines</button>
          <button type="button" className="btn danger solid" onClick={go} disabled={busy}><Ban />{busy ? "Cancelling…" : "Cancel lines"}</button>
        </>
      }>
      {err && <div className="mb"><Banner tone="danger" title="Not cancelled">{err}</Banner></div>}
      <div className="ws2-cn-reasons" role="radiogroup" aria-label="Reason">
        {REASONS.map((r) => (
          <label key={r.code} className="ws2-radio"><input type="radio" name="ws2-cn" value={r.code} checked={reason === r.code} onChange={() => setReason(r.code)} /><span>{r.label}</span></label>
        ))}
      </div>
      <label className="ws2-fld ws2-full"><span>Note (optional)</span><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Shopkeeper confirmed on call" /></label>
    </Modal>
  );
}
