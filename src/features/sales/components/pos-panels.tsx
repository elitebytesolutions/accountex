"use client";

import { Banknote, Check, CreditCard, Delete, Lock, Plus, Printer, Smartphone, Store, Trash2, Wallet, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { PosHeldSale, PosShift, PosShiftList, PosShiftOpenInput, PosShiftReport, ReceivablesOptions } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";

const grp = (v: number, dec = 2) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const rs = (v: number, dec = 0) => `${v < 0 ? "−" : ""}Rs ${grp(v, dec)}`;
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const hhmm = (s: string) => new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const dt = (s: string) => new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export type Tender = "CASH" | "CARD" | "JAZZCASH" | "EASYPAISA" | "CREDIT";
export type Payment = { tender: Tender; amount: number; tenderedAmount: number | null; reference: string | null };
export const TENDERS: [Tender, string, ReactNode][] = [
  ["CASH", "Cash", <Banknote key="i" />], ["CARD", "Card", <CreditCard key="i" />], ["JAZZCASH", "JazzCash", <Smartphone key="i" />],
  ["EASYPAISA", "Easypaisa", <Wallet key="i" />], ["CREDIT", "Credit", <Store key="i" />],
];
const tenderLabel = (t: string) => TENDERS.find((x) => x[0] === t)?.[1] ?? t;
const DENOMS = [5000, 1000, 500, 100, 50, 20, 10, 5, 1];

/** Template `.overlay > .modal` rendered inside the screen (so the `.sd-screen` rules apply); Escape / scrim close it. */
export function PosOverlay({ onClose, className, children }: { onClose: () => void; className?: string; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("modal", className)} role="dialog" aria-modal>{children}</div>
    </div>
  );
}
const Head = ({ title, sub, onClose }: { title: string; sub?: ReactNode; onClose: () => void }) => (
  <div className="modal-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div><button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button></div>
);

/** Added (no template): opening a shift on a counter with a cash float. */
export function OpenShiftPanel({ options, busy, error, onOpen }: { options: ReceivablesOptions; busy: boolean; error: Record<string, string>; onOpen: (b: PosShiftOpenInput) => void }) {
  const [f, setF] = useState(() => ({
    branchId: options.branches[0]?.id ?? "", warehouseId: options.warehouses[0]?.id ?? "", counterName: "Counter 1",
    cashAccountId: options.cashAccounts[0]?.id ?? "", openingFloat: "10000",
  }));
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const whs = options.warehouses.filter((w) => !w.branchId || w.branchId === f.branchId);
  return (
    <div className="panel" style={{ maxWidth: 640, margin: "24px auto" }}>
      <div className="panel-head"><div><h3>Open a shift</h3><p>Count the float into the drawer, then start selling. One open shift per counter and per cashier.</p></div><span className="sd-head-ic sm"><Lock /></span></div>
      <FormGrid>
        <Field label="Branch" required error={error.branchId}><Select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>{options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label="Warehouse" required error={error.warehouseId}><Select value={f.warehouseId} onChange={(e) => set("warehouseId", e.target.value)}>{(whs.length ? whs : options.warehouses).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        <Field label="Counter" required error={error.counterName}><Input value={f.counterName} onChange={(e) => set("counterName", e.target.value)} /></Field>
        <Field label="Cash drawer account" required error={error.cashAccountId}><Select value={f.cashAccountId} onChange={(e) => set("cashAccountId", e.target.value)}>{options.cashAccounts.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</Select></Field>
        <Field label="Opening float (Rs)" error={error.openingFloat}><Input type="number" min="0" value={f.openingFloat} onChange={(e) => set("openingFloat", e.target.value)} /></Field>
      </FormGrid>
      <div className="form-actions"><button type="button" className="btn primary" disabled={busy || !f.cashAccountId} onClick={() => onOpen({ ...f, openingFloat: Number(f.openingFloat) || 0 })}><Check />{busy ? "Opening…" : "Open shift"}</button></div>
    </div>
  );
}

/** Template tender pad (#sd-pos-tender) with split payments: each tender adds a payment until the bill is covered. */
export function TenderPad({ total, busy, onClose, onComplete }: { total: number; busy: boolean; onClose: () => void; onComplete: (p: Payment[]) => void }) {
  const [m, setM] = useState<Tender>("CASH");
  const [amt, setAmt] = useState("");
  const [ref, setRef] = useState("");
  const [pays, setPays] = useState<Payment[]>([]);
  const paid = r2(pays.reduce((s, p) => s + p.amount, 0));
  const due = r2(total - paid);
  const val = Number(amt) || 0;
  const change = m === "CASH" ? r2(val - due) : 0;
  const key = (k: string) => setAmt((a) => (k === "back" ? a.slice(0, -1) : (a + k).replace(/^0+(?=\d)/, "").slice(0, 10)));
  const current = (): Payment | null => {
    if (val <= 0 || due <= 0) return null;
    const amount = r2(Math.min(val, due));
    return { tender: m, amount, tenderedAmount: m === "CASH" ? val : null, reference: ref.trim() || null };
  };
  const add = () => { const p = current(); if (p) { setPays((x) => [...x, p]); setAmt(""); setRef(""); } };
  const complete = () => {
    const p = current();
    const all = p ? [...pays, p] : pays;
    if (r2(all.reduce((s, x) => s + x.amount, 0)) !== r2(total)) return;
    onComplete(all);
  };
  const covered = r2(paid + (val > 0 ? Math.min(val, due) : 0)) >= r2(total);
  return (
    <PosOverlay onClose={onClose} className="sd-tender">
      <Head title="Take payment" sub="Choose a tender and key in the amount received. Add another tender to split the bill." onClose={onClose} />
      <div className="sd-tmethods" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        {TENDERS.map(([k, label, icon]) => <button key={k} type="button" className={cn(m === k && "active")} onClick={() => { setM(k); if (k !== "CASH" && !amt) setAmt(String(due)); }}>{icon}{label}</button>)}
      </div>
      <div className="sd-tscreen">
        <div><small>{pays.length ? "Still due" : "Total due"}</small><b>{rs(due, 2)}</b></div>
        <div className="sd-tamt"><small>{m === "CASH" ? "Received" : tenderLabel(m)}</small><b>{amt ? grp(val, 0) : <span className="sd-ph">0</span>}</b></div>
      </div>
      {m === "CASH" ? (
        <div className="sd-tquick">
          {[["exact", "Exact"], ["500", "Rs 500"], ["1000", "Rs 1,000"], ["5000", "Rs 5,000"]].map(([q, l]) => (
            <button key={q} type="button" onClick={() => setAmt(q === "exact" ? String(due) : String(Math.max(Number(q), Math.ceil(due / Number(q)) * Number(q))))}>{l}</button>
          ))}
        </div>
      ) : (
        <label className="sd-find" style={{ marginBottom: 8 }}><CreditCard /><input className="cell-input" placeholder={m === "CREDIT" ? "Note (optional)" : "Approval / transaction ref"} value={ref} onChange={(e) => setRef(e.target.value)} /></label>
      )}
      <div className="sd-keypad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"].map((k) => <button key={k} type="button" onClick={() => key(k)}>{k}</button>)}
        <button type="button" aria-label="Backspace" onClick={() => key("back")}><Delete /></button>
      </div>
      {pays.length > 0 && (
        <div className="sd-mini-list" style={{ display: "flex", padding: "8px 12px", border: "1px dashed var(--line-2)", borderRadius: 12, marginTop: 10 }}>
          {pays.map((p, i) => <span key={i}>{tenderLabel(p.tender)} <b>{rs(p.amount, 2)}</b> <button type="button" className="icon-btn-sm" aria-label="Remove payment" onClick={() => setPays((x) => x.filter((_, j) => j !== i))}><Trash2 /></button></span>)}
        </div>
      )}
      <div className={cn("sd-tchange", m === "CASH" && val > 0 && (change >= 0 ? "ok" : "short"))}>
        <span>{m === "CASH" && change < 0 && val > 0 ? "Still short" : "Change due"}</span><b>{rs(m === "CASH" && val > 0 ? Math.abs(change) : 0, 2)}</b>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn secondary" onClick={onClose}>Back to cart</button>
        <button type="button" className="btn ghost" disabled={!current() || covered} onClick={add}><Plus />Add &amp; split</button>
        <button type="button" className="btn primary lg" disabled={busy || !covered} onClick={complete}><Check />{busy ? "Completing…" : "Complete sale"}</button>
      </div>
    </PosOverlay>
  );
}

/** Template close-shift modal (#sd-pos-closeshift): count the drawer by denomination; over / short against the expected cash. */
export function CloseShift({ shift, held, busy, onClose, onConfirm }: { shift: PosShift; held: number; busy: boolean; onClose: () => void; onConfirm: (d: { denomination: number; noteCount: number }[]) => void }) {
  const [cnt, setCnt] = useState<Record<number, string>>({});
  const counted = DENOMS.reduce((s, d) => s + d * (Number(cnt[d]) || 0), 0);
  const os = r2(counted - shift.expectedCash);
  return (
    <PosOverlay onClose={onClose} className="wide">
      <Head title={`Close shift · ${shift.counterName}`} sub={`Count the drawer. Opened ${hhmm(shift.openedAt)} by ${shift.cashier?.name ?? "—"} with a ${rs(shift.openingFloat)} float.`} onClose={onClose} />
      <div className="sd-shift-grid">
        <div className="table-wrap">
          <table className="tbl compact" data-plain="">
            <thead><tr><th>Denomination</th><th className="num">Count</th><th className="num">Amount</th></tr></thead>
            <tbody>{DENOMS.map((d) => (
              <tr key={d}><td className="sd-den">Rs {d.toLocaleString("en-US")}</td>
                <td><input className="sd-den-in" type="number" min="0" inputMode="numeric" value={cnt[d] ?? ""} placeholder="0" aria-label={`Rs ${d} notes`} onChange={(e) => setCnt((x) => ({ ...x, [d]: e.target.value }))} /></td>
                <td className="num">{grp(d * (Number(cnt[d]) || 0), 0)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="sd-shift-sum">
          <div><small>Opening float</small><b>{rs(shift.openingFloat)}</b></div>
          <div><small>Cash sales (this shift)</small><b>{rs(shift.cashSales, 2)}</b></div>
          <div><small>Expected in drawer</small><b>{rs(shift.expectedCash, 2)}</b></div>
          <div><small>Counted</small><b>{rs(counted)}</b></div>
          <div className={cn("sd-os", os === 0 ? "even" : os < 0 ? "short" : "over")}><small>Over / Short</small><b>{os > 0 ? "+" : ""}{rs(os, 2)}</b></div>
          <div className="sd-mini-list" style={{ display: "flex" }}><span>Card <b>{rs(shift.cardSales)}</b></span><span>Wallets <b>{rs(shift.walletSales)}</b></span><span>Credit <b>{rs(shift.creditSales)}</b></span><span>Bills <b>{shift.billsCount}</b></span></div>
          {held > 0 && <small className="hint text-danger">{held} held bill{held === 1 ? "" : "s"}: complete or discard them before closing.</small>}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn secondary" onClick={onClose}>Keep shift open</button>
        <button type="button" className="btn primary" disabled={busy} onClick={() => onConfirm(DENOMS.filter((d) => Number(cnt[d]) > 0).map((d) => ({ denomination: d, noteCount: Number(cnt[d]) })))}><Lock />{busy ? "Closing…" : "Close shift & print Z-report"}</button>
      </div>
    </PosOverlay>
  );
}

/** Added: the Z-report of a shift (totals by tender, bills, cash count, over / short). */
export function ZReport({ report, onClose }: { report: PosShiftReport | null; onClose: () => void }) {
  return (
    <PosOverlay onClose={onClose} className="wide">
      <Head title={report ? `Z-report ${report.zReportNo ?? "(shift open)"}` : "Z-report"} sub={report ? `${report.counterName} · ${report.branch.name} · ${report.cashier?.name ?? "—"} · ${dt(report.openedAt)}${report.closedAt ? ` → ${dt(report.closedAt)}` : ""}` : undefined} onClose={onClose} />
      {!report ? <Skeleton style={{ height: 240 }} /> : (
        <div className="sd-shift-grid">
          <div>
            <div className="table-wrap" style={{ border: "1px solid var(--line)", borderRadius: 14 }}>
              <table className="tbl compact" data-plain="">
                <thead><tr><th>Tender</th><th className="num">Payments</th><th className="num">Amount</th></tr></thead>
                <tbody>{report.byTender.length ? report.byTender.map((t) => <tr key={t.tender}><td>{tenderLabel(t.tender)}</td><td className="num">{t.count}</td><td className="num">{grp(t.amount)}</td></tr>) : <tr><td colSpan={3} className="muted">No sales</td></tr>}</tbody>
              </table>
            </div>
            <div className="table-wrap" style={{ border: "1px solid var(--line)", borderRadius: 14, marginTop: 12, maxHeight: 260, overflowY: "auto" }}>
              <table className="tbl compact" data-plain="">
                <thead><tr><th>Bill</th><th>Customer</th><th className="num">Amount</th></tr></thead>
                <tbody>{report.bills.map((b) => <tr key={b.id}><td><a className="link" href={`/sales/invoices/${b.id}`}>{b.docNo}</a></td><td>{b.customer}</td><td className="num">{grp(b.netAmount)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <div className="sd-shift-sum">
            <div><small>Status</small><b>{report.status === "OPEN" ? <Badge tone="good" dot>Open</Badge> : <Badge tone="neutral" dot>Closed</Badge>}</b></div>
            <div><small>Opening float</small><b>{rs(report.openingFloat)}</b></div>
            <div><small>Cash sales</small><b>{rs(report.cashSales, 2)}</b></div>
            <div><small>Expected in drawer</small><b>{rs(report.expectedCash, 2)}</b></div>
            <div><small>Counted</small><b>{report.countedCash === null ? "—" : rs(report.countedCash, 2)}</b></div>
            <div className={cn("sd-os", report.overShort === null ? "" : report.overShort === 0 ? "even" : report.overShort < 0 ? "short" : "over")}><small>Over / Short</small><b>{report.overShort === null ? "—" : `${report.overShort > 0 ? "+" : ""}${rs(report.overShort, 2)}`}</b></div>
            <div className="sd-mini-list" style={{ display: "flex" }}><span>Card <b>{rs(report.cardSales)}</b></span><span>Wallets <b>{rs(report.walletSales)}</b></span><span>Credit <b>{rs(report.creditSales)}</b></span><span>Bills <b>{report.billsCount}</b></span></div>
            {report.journal && <small className="muted">Over / short posted in {report.journal.docNo}</small>}
          </div>
        </div>
      )}
      <div className="modal-foot"><button type="button" className="btn secondary" onClick={() => window.print()}><Printer />Print</button><button type="button" className="btn primary" onClick={onClose}>Done</button></div>
    </PosOverlay>
  );
}

/** Template #sd-pos-recall (Held bills): resume a parked bill into the cart or discard it. */
export function HeldBills({ held, onClose, onResume, onDiscard }: { held: PosHeldSale[]; onClose: () => void; onResume: (h: PosHeldSale) => void; onDiscard: (h: PosHeldSale) => void }) {
  return (
    <PosOverlay onClose={onClose}>
      <Head title="Held bills" sub="Parked sales on this shift. Resume one to finish it, or discard it." onClose={onClose} />
      {held.length ? (
        <div className="list">
          {held.map((h) => (
            <div key={h.id} className="list-item">
              <div><b>{h.docNo} · {h.customer.name}</b><small>{h.lines.length} item{h.lines.length === 1 ? "" : "s"} · held {hhmm(h.createdAt)}</small></div>
              <span className="spacer" /><b>{rs(h.netAmount, 2)}</b>
              <button type="button" className="btn secondary sm" onClick={() => onResume(h)}>Resume</button>
              <button type="button" className="icon-btn-sm" aria-label="Discard" onClick={() => onDiscard(h)}><Trash2 /></button>
            </div>
          ))}
        </div>
      ) : <p className="muted">No held bills.</p>}
    </PosOverlay>
  );
}

/** Added: closed and open shifts (pos:view) opening their Z-reports. */
export function ShiftHistory({ list, onClose, onOpen }: { list: PosShiftList | null; onClose: () => void; onOpen: (id: string) => void }) {
  return (
    <PosOverlay onClose={onClose} className="wide">
      <Head title="Shift history" sub="Every counter shift with its takings and cash count." onClose={onClose} />
      {!list ? <Skeleton style={{ height: 200 }} /> : (
        <div className="table-wrap" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <table className="tbl compact" data-plain="">
            <thead><tr><th>Z-report</th><th>Counter</th><th>Cashier</th><th>Opened</th><th className="num">Bills</th><th className="num">Cash</th><th className="num">Over / short</th><th>Status</th></tr></thead>
            <tbody>{list.items.map((s) => (
              <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => onOpen(s.id)}>
                <td><span className="link">{s.zReportNo ?? "—"}</span></td><td>{s.counterName}</td><td>{s.cashier?.name ?? "—"}</td><td>{dt(s.openedAt)}</td>
                <td className="num">{s.billsCount}</td><td className="num">{grp(s.cashSales)}</td><td className="num">{s.overShort === null ? "—" : grp(s.overShort)}</td>
                <td>{s.status === "OPEN" ? <Badge tone="good" dot>Open</Badge> : <Badge tone="neutral" dot>Closed</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </PosOverlay>
  );
}

/** Template thermal receipt (.sd-receipt) after a completed sale. */
export function SaleReceipt({ docNo, lines, total, payments, change, customer, onClose }: {
  docNo: string; lines: { name: string; qty: number; rate: number; amount: number }[]; total: number; payments: Payment[]; change: number; customer: string; onClose: () => void;
}) {
  return (
    <PosOverlay onClose={onClose}>
      <Head title="Sale complete" sub={`${docNo} · ${customer}`} onClose={onClose} />
      <div style={{ display: "flex", justifyContent: "center", background: "var(--surface-2)", padding: 18, borderRadius: 14 }}>
        <div className="sd-receipt">
          <div className="sd-rc-c"><b className="sd-rc-co">SALES RECEIPT</b><small>{docNo}</small><small>{new Date().toLocaleString("en-GB")}</small></div>
          <div className="sd-rc-cut" />
          {lines.map((l, i) => <div key={i} className="sd-rc-l"><span>{l.name}</span><span>{l.qty} × {grp(l.rate)}</span><span>{grp(l.amount)}</span></div>)}
          <div className="sd-rc-cut" />
          <div className="sd-rc-kv sd-rc-big"><span>TOTAL</span><b>{grp(total)}</b></div>
          {payments.map((p, i) => <div key={i} className="sd-rc-kv"><span>{tenderLabel(p.tender)}</span><b>{grp(p.tenderedAmount ?? p.amount)}</b></div>)}
          <div className="sd-rc-kv"><span>Change</span><b>{grp(change)}</b></div>
          <div className="sd-rc-cut" />
          <div className="sd-rc-c sd-rc-thanks"><b>Thank you!</b></div>
        </div>
      </div>
      <div className="modal-foot"><button type="button" className="btn secondary" onClick={() => window.print()}><Printer />Print</button><button type="button" className="btn primary" onClick={onClose}><Check />New sale</button></div>
    </PosOverlay>
  );
}
