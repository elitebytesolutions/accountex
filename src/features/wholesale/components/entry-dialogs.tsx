"use client";

import { BookmarkPlus, Gift, Info, Package, Pause, Plus, Search, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { amountInWords, tierRate } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { Hl } from "@/features/finance/components/finance-ui";
import { grp, num, pk, qtyStr, rs, schemeFor, schemeLabel, type Opts, type Product } from "./entry-shared";

/** A bare template overlay (`.overlay.open`) for the custom credit modal and the bottom sheet; Escape / scrim close it. */
function Overlay({ onClose, sheet, children }: { onClose: () => void; sheet?: boolean; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return createPortal(
    <div className={cn("overlay open ws2-ov", sheet && "sheet-overlay")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>{children}</div>,
    document.body,
  );
}

// ---------------------------------------------------------------- credit block (template #ws2-m-credit, without the manager PIN)
export type CreditFacts = { shop: string; limit: number; balance: number; bill: number; overdue: number; onHold: boolean; holdReason: string | null };

export function CreditModal({ facts, message, canHold, holding, onHold, onClose }: {
  facts: CreditFacts; message: string; canHold: boolean; holding: boolean; onHold: () => void; onClose: () => void;
}) {
  const after = facts.balance + facts.bill;
  const over = facts.limit > 0 ? after - facts.limit : 0;
  const cells: [string, string, string][] = [
    ["Credit limit", facts.limit > 0 ? rs(facts.limit) : "None", ""], ["Outstanding", rs(facts.balance), ""], ["This bill", rs(facts.bill), ""],
    ["After this bill", rs(after), "bad"], ["Over by", over > 0 ? rs(over) : "—", over > 0 ? "bad" : ""], ["Overdue", facts.overdue > 0 ? rs(facts.overdue) : "None", facts.overdue > 0 ? "bad" : ""],
  ];
  return (
    <Overlay onClose={onClose}>
      <div className="modal ws2-crmodal" role="alertdialog" aria-modal aria-label={facts.onHold ? "Shop on hold" : "Credit limit exceeded"}>
        <div className="ws2-cr-hero">
          <span className="ws2-cr-ic"><ShieldAlert /></span>
          <div>
            <h2>{facts.onHold ? "Shop is on credit hold" : "Credit limit exceeded"}</h2>
            <p>Saving is blocked: <b>{facts.shop}</b> {facts.onHold ? `is on hold${facts.holdReason ? ` (${facts.holdReason})` : ""}.` : "would exceed its credit limit."}</p>
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="ws2-cr-dl">
          {cells.map(([k, v, t]) => <div key={k} className={t}><span>{k}</span><b>{v}</b></div>)}
        </div>
        {message && <p className="ws2-cr-msg">{message}</p>}
        <div className="ws2-cr-note"><Info /><span>Hold the bill to park it until the shop pays or a manager raises the limit. Manager override arrives with credit control.</span></div>
        <div className="modal-foot">
          {canHold && <Button icon={<Pause />} disabled={holding} onClick={onHold}>{holding ? "Holding…" : "Hold bill"}</Button>}
          <Button variant="primary" onClick={onClose}>Back to bill</Button>
        </div>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------- add many (template #ws2-m-many)
export function AddManyModal({ open, o, factor, tierName, stock, onClose, onAdd }: {
  open: boolean; o: Opts; factor: number; tierName: string; stock: Record<string, number> | null; onClose: () => void;
  onAdd: (rows: { itemId: string; ctn: number; pcs: number }[]) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, { ctn: string; pcs: string }>>({});
  const qRef = useRef<HTMLInputElement>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setQ(""); setSel({}); }
  }
  useEffect(() => { if (open) setTimeout(() => qRef.current?.focus(), 120); }, [open]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return o.products.filter((p) => !s || `${p.name} ${p.sku}`.toLowerCase().includes(s)).slice(0, 200);
  }, [o.products, q]);
  const byId = useMemo(() => new Map(o.products.map((p) => [p.id, p])), [o.products]);
  const picked = Object.entries(sel).filter(([, v]) => num(v.ctn) + num(v.pcs) > 0);
  let ctn = 0, pcs = 0, amt = 0;
  for (const [id, v] of picked) {
    const p = byId.get(id);
    if (!p) continue;
    ctn += num(v.ctn); pcs += num(v.pcs);
    amt += (num(v.ctn) * pk(p) + num(v.pcs)) * tierRate(p, factor) * (1 + p.taxRate / 100);
  }
  const set = (id: string, patch: Partial<{ ctn: string; pcs: string }>) => setSel((s) => ({ ...s, [id]: { ctn: s[id]?.ctn ?? "", pcs: s[id]?.pcs ?? "", ...patch } }));
  const toggle = (p: Product, on: boolean) => setSel((s) => {
    const n = { ...s };
    if (on) n[p.id] = { ctn: n[p.id]?.ctn || "1", pcs: n[p.id]?.pcs ?? "" };
    else delete n[p.id];
    return n;
  });
  const go = () => {
    if (!picked.length) return;
    onAdd(picked.map(([itemId, v]) => ({ itemId, ctn: Math.round(num(v.ctn)), pcs: Math.round(num(v.pcs)) })));
  };
  const move = (e: ReactKeyboardEvent<HTMLInputElement>, field: "ctn" | "pcs") => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); return; }
    if (e.key !== "Enter" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const rows = Array.from(e.currentTarget.closest(".ws2-many-list")?.querySelectorAll<HTMLElement>("[data-id]") ?? []);
    const i = rows.indexOf(e.currentTarget.closest("[data-id]") as HTMLElement);
    const nx = rows[i + (e.key === "ArrowUp" ? -1 : 1)]?.querySelector<HTMLInputElement>(`[data-q="${field}"]`);
    nx?.focus(); nx?.select();
  };

  return (
    <Modal open={open} onClose={onClose} wide title="Add many products" subtitle="Tick products and type CTN / PCS. Typing a quantity ticks the row."
      foot={<>
        <span className="ws2-many-sum">{picked.length ? <><b>{picked.length}</b> selected · {ctn} ctn + {pcs} pcs · <b>{rs(amt)}</b></> : "Nothing selected"}</span>
        <span className="spacer" />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={<Plus />} disabled={!picked.length} onClick={go}>{picked.length ? `Add ${picked.length} item${picked.length > 1 ? "s" : ""}` : "Add items"}</Button>
      </>}>
      <div className="ws2-many-bar">
        <label className="ws2-find"><Search /><input ref={qRef} className="cell-input" value={q} placeholder="Filter by name or SKU…" autoComplete="off" aria-label="Filter products"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); e.currentTarget.closest(".modal")?.querySelector<HTMLInputElement>(".ws2-many-list [data-q=ctn]")?.focus(); } }} /></label>
      </div>
      <div className="ws2-many-list">
        {list.length ? list.map((p, i) => {
          const s = sel[p.id];
          const on = !!s && num(s.ctn) + num(s.pcs) > 0;
          const have = stock ? stock[p.id] ?? 0 : null;
          const sch = schemeFor(o, p.id);
          return (
            <label key={p.id} className={cn("ws2-many-row", on && "on")} data-id={p.id} style={{ "--i": Math.min(i, 30) } as CSSProperties} onClick={(e) => { if ((e.target as HTMLElement).closest("[data-q]")) e.preventDefault(); }}>
              <input type="checkbox" checked={on} aria-label={`Select ${p.name}`} onChange={(e) => toggle(p, e.target.checked)} />
              <span className="icon-well sm"><Package /></span>
              <div className="ws2-ac-main">
                <b><Hl text={p.name} q={q.trim()} /></b>
                <small>{p.sku} · Ctn {pk(p)} · Rs {grp(tierRate(p, factor))}/pc{sch && <> · <span className="ws2-sch sm on"><Gift />{schemeLabel(sch)}</span></>}</small>
              </div>
              {have !== null && <span className={cn("ws2-ac-stock", have <= 0 && "out")}>{have <= 0 ? "Out" : qtyStr(p, have)}</span>}
              <span className="ws2-many-q">
                <input className="cell-input num" data-q="ctn" inputMode="numeric" placeholder="CTN" value={s?.ctn ?? ""} aria-label={`${p.name} cartons`} onChange={(e) => set(p.id, { ctn: e.target.value })} onKeyDown={(e) => move(e, "ctn")} />
                <input className="cell-input num" data-q="pcs" inputMode="numeric" placeholder="PCS" value={s?.pcs ?? ""} aria-label={`${p.name} pieces`} onChange={(e) => set(p.id, { pcs: e.target.value })} onKeyDown={(e) => move(e, "pcs")} />
              </span>
            </label>
          );
        }) : <div className="ws2-pop-empty">No products match.</div>}
      </div>
      <p className="ws2-muted" style={{ fontSize: 12, margin: "8px 2px 0" }}>{tierName} rates · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> adds the selection</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- save as template (template FS.sheet)
export function TemplateSheet({ count, shopName, chips, busy, error, onClose, onSave }: {
  count: number; shopName: string | null; chips: { key: number; name: string; ctn: number; pcs: number }[]; busy: boolean; error: string;
  onClose: () => void; onSave: (v: { name: string; forShop: boolean; isShared: boolean }) => void;
}) {
  const [name, setName] = useState(shopName ? `${shopName} · weekly` : "Weekly standard order");
  const [forShop, setForShop] = useState(!!shopName);
  const [isShared, setShared] = useState(true);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 200); }, []);
  const go = () => onSave({ name: name.trim(), forShop, isShared });
  return (
    <Overlay onClose={onClose} sheet>
      <div className="sheet ws2-tpl-sheet" role="dialog" aria-modal aria-label="Save as template">
        <span className="sheet-grab" />
        <div className="modal-head">
          <div><h2>Save as template</h2><p>{count} line{count === 1 ? "" : "s"} will be saved with their CTN / PCS</p></div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <div className="sheet-body">
          <label className="ws2-fld ws2-full"><span>Template name</span>
            <input ref={ref} value={name} maxLength={80} className={cn(error && "ws2-bad-in")} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }} />
            {error && <small className="ws2-err">{error}</small>}
          </label>
          <div className="ws2-tpl-opts">
            {shopName && <label className="ws2-chk"><input type="checkbox" checked={forShop} onChange={(e) => setForShop(e.target.checked)} />Only for {shopName}</label>}
            <label className="ws2-chk"><input type="checkbox" checked={isShared} onChange={(e) => setShared(e.target.checked)} />Shared with the team</label>
          </div>
          <div className="ws2-tpl-prev">{chips.map((c) => <span key={c.key} className="pill"><Package />{c.name} <b>{c.ctn}/{c.pcs}</b></span>)}</div>
        </div>
        <div className="modal-foot">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<BookmarkPlus />} disabled={busy} onClick={go}>{busy ? "Saving…" : "Save template"}</Button>
        </div>
      </div>
    </Overlay>
  );
}

// ---------------------------------------------------------------- print paper (template paperHtml)
export type Snapshot = {
  docNo: string | null; date: string; dueDate: string | null; terms: string; company: string; companySub: string;
  shop: { name: string; code: string; area: string; phone: string }; route: string; tier: string; factor: number; salesman: string;
  lines: { key: number; name: string; sku: string; pack: number; ctn: number; pcs: number; tp: number; rate: number; disc: number; gst: number; net: number; free: number; scheme: string | null }[];
  tot: { gross: number; sv: number; disc: number; gst: number; net: number };
};

export function PrintPaper({ s, dateLabel }: { s: Snapshot; dateLabel: (iso: string) => string }) {
  return (
    <div className="paper ws2-paper">
      <div className="paper-head">
        <div><h2>{s.company}</h2><p className="ws2-pmuted">{s.companySub}</p></div>
        <div className="doc-title"><h2>Wholesale Tax Invoice</h2><b>{s.docNo ?? "Not saved yet"}</b><p className="ws2-pmuted">{dateLabel(s.date)}{s.route ? ` · ${s.route}` : ""}</p></div>
      </div>
      <div className="paper-meta">
        <div><small>Bill to</small><b>{s.shop.name}</b><div className="ws2-pmuted">{[s.shop.code, s.shop.area].filter(Boolean).join(" · ")}{s.shop.phone ? <><br />{s.shop.phone}</> : null}</div></div>
        <div><small>Price tier</small><b>{s.tier}</b><div className="ws2-pmuted">Rates ×{s.factor.toFixed(2)}</div></div>
        <div><small>Terms</small><b>{s.terms || "—"}</b><div className="ws2-pmuted">{s.dueDate ? `Due ${dateLabel(s.dueDate)}` : ""}</div></div>
        <div><small>Salesman</small><b>{s.salesman || "—"}</b></div>
      </div>
      <table className="tbl" data-plain>
        <thead><tr><th>#</th><th>Item</th><th className="num">CTN</th><th className="num">PCS</th><th className="num">Total</th><th className="num">Rate</th><th className="num">Disc</th><th className="num">GST</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {s.lines.map((l, i) => (
            <PrintRow key={l.key} l={l} i={i} />
          ))}
        </tbody>
      </table>
      <div className="ws2-paper-bot">
        <div className="ws2-pmuted">Scheme value given: <b>{rs(s.tot.sv, 2)}</b><br />Goods once sold are returnable within 7 days with invoice.</div>
        <div className="paper-totals">
          <div><span>Gross amount</span><b>{grp(s.tot.gross)}</b></div>
          <div><span>Discount</span><b>− {grp(s.tot.disc)}</b></div>
          <div><span>Sales tax (GST)</span><b>{grp(s.tot.gst)}</b></div>
          <div className="grand"><span>Net payable</span><span>{rs(s.tot.net, 2)}</span></div>
        </div>
      </div>
      <div className="paper-foot"><span><b>Amount in words:</b> {amountInWords(s.tot.net)}</span><span>Received by ____________</span></div>
    </div>
  );
}

function PrintRow({ l, i }: { l: Snapshot["lines"][number]; i: number }) {
  return (
    <>
      <tr><td>{i + 1}</td><td><b>{l.name}</b><small>{l.sku} · Ctn {l.pack}</small></td><td className="num">{l.ctn || "—"}</td><td className="num">{l.pcs || "—"}</td><td className="num">{grp(l.tp, 0)}</td><td className="num">{grp(l.rate)}</td><td className="num">{l.disc}%</td><td className="num">{grp(l.gst)}</td><td className="num"><b>{grp(l.net)}</b></td></tr>
      {l.free > 0 && <tr className="ws2-pfree"><td /><td>↳ {l.name} <em>FREE{l.scheme ? ` · ${l.scheme}` : ""}</em></td><td /><td /><td className="num">{l.free}</td><td className="num">0.00</td><td /><td /><td className="num">0.00</td></tr>}
    </>
  );
}
