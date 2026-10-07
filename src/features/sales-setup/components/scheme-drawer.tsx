"use client";

import { BadgePercent, Gift, History, PackagePlus, Pencil, Percent, Plus, Timer, Trash2, Truck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ITEM_ROLES, schemeErrors, type Product, type Scheme, type SchemeType } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { listCustomers } from "@/features/parties/api";
import { listProducts } from "@/features/inventory/products-api";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createScheme, deleteScheme, updateScheme } from "../api";
import { today, type Can } from "./common";

export const SCHEME_LOOK: Record<string, { icon: React.ReactNode; tone: string; label: string; sub: string }> = {
  FREE_GOODS: { icon: <Gift />, tone: "lime", label: "Free goods", sub: "Buy X get Y free" },
  INVOICE_DISCOUNT: { icon: <Percent />, tone: "blue", label: "Invoice discount", sub: "% off above a value" },
  BUNDLE_PRICE: { icon: <PackagePlus />, tone: "orange", label: "Bundle price", sub: "Fixed price for a set" },
  LINE_DISCOUNT: { icon: <BadgePercent />, tone: "violet", label: "Line discount", sub: "Rs or % off an item" },
  SETTLEMENT: { icon: <Timer />, tone: "red", label: "Settlement", sub: "% off for paying early" },
  SERVICE: { icon: <Truck />, tone: "green", label: "Service", sub: "Free delivery and the like" },
};
const ROLE_LABEL: Record<string, string> = { BUY: "Buy", FREE: "Free", BUNDLE: "In bundle", DISCOUNTED: "Discounted" };
const DEFAULT_ROLE: Record<string, string> = { FREE_GOODS: "BUY", BUNDLE_PRICE: "BUNDLE", LINE_DISCOUNT: "DISCOUNTED" };

type Item = { itemId: string; label: string; itemRole: string; qty: string };
type Who = { kind: "GROUP" | "CUSTOMER" | "TIER"; refId: string; label: string; isExcluded: boolean };
type F = Record<string, string | boolean>;
const num = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const init = (s: Scheme | null): F => ({
  name: s?.name ?? "", description: s?.description ?? "", schemeType: s?.schemeType ?? "FREE_GOODS", validFrom: s?.validFrom ?? today(),
  validTo: s?.validTo ?? new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), buyQty: num(s?.buyQty), freeQty: num(s?.freeQty),
  discountMode: s?.discountAmount != null ? "AMT" : "PCT", discount: num(s?.discountAmount ?? s?.discountPct), minInvoiceAmount: num(s?.minInvoiceAmount),
  minLineQty: num(s?.minLineQty), bundlePrice: num(s?.bundlePrice), settlementDays: num(s?.settlementDays), appliesToAll: s?.appliesToAll ?? false,
  budgetCap: num(s?.budgetCap), maxUsesPerCustomer: num(s?.maxUsesPerCustomer),
});

/** Template "New scheme" drawer (type cards + form), extended with all six types, products, audience, edit, history and delete. */
export function SchemeDrawer({ scheme, groups, tiers, can, onClose, onSaved }: {
  scheme: Scheme | null;
  groups: { id: string; name: string }[];
  tiers: { code: string; name: string }[];
  can: Can;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<F>(() => init(scheme));
  const [items, setItems] = useState<Item[]>(() => scheme?.items.map((i) => ({ itemId: i.product.id, label: `${i.product.sku} · ${i.product.name}`, itemRole: i.itemRole, qty: num(i.qty) })) ?? []);
  const [who, setWho] = useState<Who[]>(() => scheme?.eligibility.map((e) => ({ kind: e.kind, refId: e.refId, label: e.label, isExcluded: e.isExcluded })) ?? []);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pq, setPq] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const [cq, setCq] = useState("");
  const [custs, setCusts] = useState<{ id: string; name: string; code: string }[]>([]);
  const ro = !can.approve;
  const type = String(f.schemeType) as SchemeType;
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };

  useEffect(() => {
    if (!pq.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => listProducts({ page: 1, pageSize: 8, search: pq.trim() }).then((r) => !cancelled && setFound(r.items)).catch(() => undefined), 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pq]);
  useEffect(() => {
    if (!cq.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => listCustomers({ page: 1, pageSize: 8, search: cq.trim() }).then((r) => !cancelled && setCusts(r.items.map((c) => ({ id: c.id, name: c.name, code: c.code })))).catch(() => undefined), 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [cq]);

  const body = () => {
    const pct = f.discountMode === "PCT" ? s("discount") || null : null, amt = f.discountMode === "AMT" ? s("discount") || null : null;
    return {
      name: s("name"), description: s("description") || null, schemeType: type, validFrom: s("validFrom"), validTo: s("validTo"),
      buyQty: s("buyQty") || null, freeQty: s("freeQty") || null, discountPct: pct, discountAmount: amt, minInvoiceAmount: s("minInvoiceAmount") || null,
      minLineQty: s("minLineQty") || null, bundlePrice: s("bundlePrice") || null, settlementDays: s("settlementDays") || null, appliesToAll: Boolean(f.appliesToAll),
      budgetCap: s("budgetCap") || null, maxUsesPerCustomer: s("maxUsesPerCustomer") || null,
      items: ["FREE_GOODS", "BUNDLE_PRICE", "LINE_DISCOUNT"].includes(type) ? items.map((i) => ({ itemId: i.itemId, itemRole: i.itemRole, qty: i.qty || null })) : [],
      eligibility: who.map((w) => ({ customerGroupId: w.kind === "GROUP" ? w.refId : null, customerId: w.kind === "CUSTOMER" ? w.refId : null, priceTier: w.kind === "TIER" ? w.refId : null, isExcluded: w.isExcluded })),
    };
  };
  const save = async () => {
    const b = body();
    const local = schemeErrors({ ...b, discountPct: b.discountPct === null ? null : Number(b.discountPct), discountAmount: b.discountAmount === null ? null : Number(b.discountAmount), buyQty: b.buyQty === null ? null : 1, freeQty: b.freeQty === null ? null : 1, minInvoiceAmount: b.minInvoiceAmount === null ? null : 1, bundlePrice: b.bundlePrice === null ? null : 1, settlementDays: b.settlementDays === null ? null : 1 });
    if (Object.keys(local).length) { setErrs(local.discountPct ? { ...local, discount: local.discountPct } : local); toast(Object.values(local)[0]!, { tone: "danger" }); return; }
    setBusy(true);
    setErrs({});
    try {
      if (scheme) await updateScheme(scheme.id, { ...b, rowVersion: scheme.rowVersion }); else await createScheme(b);
      toast(scheme ? `${b.name} saved` : `${b.name} created${b.validFrom <= today() ? " and live" : ""}`, { tone: "good" });
      onSaved();
    } catch (e) {
      const fe = apiFieldErrors(e);
      setErrs(fe.discountPct || fe.discountAmount ? { ...fe, discount: fe.discountPct ?? fe.discountAmount ?? "" } : fe);
      toast(apiMessage(e, "Could not save the scheme"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const addWho = (w: Who) => { if (!who.some((x) => x.kind === w.kind && x.refId === w.refId)) setWho((xs) => [...xs, w]); setErrs((e) => ({ ...e, eligibility: "" })); };
  const needsItems = ["FREE_GOODS", "BUNDLE_PRICE", "LINE_DISCOUNT"].includes(type);

  return (
    <>
      <Drawer open wide onClose={onClose} title={scheme ? scheme.name : "New scheme"} subtitle={scheme ? `${scheme.code} · ${SCHEME_LOOK[scheme.schemeType]?.label ?? scheme.schemeType}` : "Trade promotion with dates, eligibility and a budget cap"}
        foot={history ? <button type="button" className="btn secondary" onClick={() => setHistory(false)}><Pencil />Back to details</button> : (
          <>
            {scheme && <button type="button" className="btn ghost" onClick={() => setHistory(true)}><History />History</button>}
            {scheme && can.remove && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
            <span className="spacer" />
            <button type="button" className="btn secondary" onClick={onClose}>{ro ? "Close" : "Cancel"}</button>
            {!ro && <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : scheme ? "Save scheme" : "Create scheme"}</button>}
          </>
        )}>
        {history && scheme ? <HistoryTab schema="Sales" table="SalesSchemes" id={scheme.id} /> : (
          <>
            <div className="cp-sch-types">
              {Object.entries(SCHEME_LOOK).map(([k, t]) => (
                <button key={k} type="button" className={cn("cp-st", type === k && "on")} disabled={ro} onClick={() => { set("schemeType", k); setItems((xs) => xs.map((i) => ({ ...i, itemRole: k === "FREE_GOODS" && i.itemRole === "FREE" ? "FREE" : DEFAULT_ROLE[k] ?? i.itemRole }))); }}>
                  <span className="icon-well sm">{t.icon}</span><b>{t.label}</b><small>{t.sub}</small>
                </button>
              ))}
            </div>
            <div className="form-grid cp-mt">
              <Field label="Scheme name" required full error={errs.name}><input value={s("name")} maxLength={120} disabled={ro} placeholder="e.g. Buy 12 get 1 free" onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Description" full error={errs.description}><input value={s("description")} maxLength={300} disabled={ro} placeholder="Shown under the name, e.g. Shan Biryani Masala 60g" onChange={(e) => set("description", e.target.value)} /></Field>
              {type === "FREE_GOODS" && <>
                <Field label="Buy (qty)" required error={errs.buyQty}><input inputMode="decimal" value={s("buyQty")} disabled={ro} onChange={(e) => set("buyQty", e.target.value)} /></Field>
                <Field label="Get free (qty)" required error={errs.freeQty}><input inputMode="decimal" value={s("freeQty")} disabled={ro} onChange={(e) => set("freeQty", e.target.value)} /></Field>
              </>}
              {(type === "INVOICE_DISCOUNT" || type === "LINE_DISCOUNT" || type === "SETTLEMENT") && (
                <Field label={type === "SETTLEMENT" ? "Discount (%)" : "Discount"} required error={errs.discount}>
                  <div className="row" style={{ gap: 6 }}>
                    {type !== "SETTLEMENT" && <select value={s("discountMode")} disabled={ro} style={{ width: 90 }} onChange={(e) => set("discountMode", e.target.value)}><option value="PCT">%</option><option value="AMT">Rs</option></select>}
                    <input inputMode="decimal" value={s("discount")} disabled={ro} onChange={(e) => { set("discount", e.target.value); if (type === "SETTLEMENT") set("discountMode", "PCT"); }} />
                  </div>
                </Field>
              )}
              {type === "INVOICE_DISCOUNT" && <Field label="Invoice value from (Rs)" required error={errs.minInvoiceAmount}><input inputMode="decimal" value={s("minInvoiceAmount")} disabled={ro} onChange={(e) => set("minInvoiceAmount", e.target.value)} /></Field>}
              {type === "LINE_DISCOUNT" && <Field label="Minimum qty on the line" error={errs.minLineQty}><input inputMode="decimal" value={s("minLineQty")} disabled={ro} onChange={(e) => set("minLineQty", e.target.value)} /></Field>}
              {type === "BUNDLE_PRICE" && <Field label="Bundle price (Rs)" required error={errs.bundlePrice}><input inputMode="decimal" value={s("bundlePrice")} disabled={ro} onChange={(e) => set("bundlePrice", e.target.value)} /></Field>}
              {type === "SETTLEMENT" && <Field label="Paid within (days)" required error={errs.settlementDays}><input inputMode="numeric" value={s("settlementDays")} disabled={ro} onChange={(e) => set("settlementDays", e.target.value)} /></Field>}
              <Field label="From" required error={errs.validFrom}><input type="date" value={s("validFrom")} disabled={ro} onChange={(e) => set("validFrom", e.target.value)} /></Field>
              <Field label="To" required error={errs.validTo}><input type="date" value={s("validTo")} disabled={ro} onChange={(e) => set("validTo", e.target.value)} /></Field>
              <Field label="Budget cap (Rs)" error={errs.budgetCap}><input inputMode="decimal" value={s("budgetCap")} disabled={ro} placeholder="No cap" onChange={(e) => set("budgetCap", e.target.value)} /></Field>
              <Field label="Max uses per customer" error={errs.maxUsesPerCustomer}><input inputMode="numeric" value={s("maxUsesPerCustomer")} disabled={ro} placeholder="Unlimited" onChange={(e) => set("maxUsesPerCustomer", e.target.value)} /></Field>
            </div>

            {needsItems && (
              <div className="cp-mt">
                <div className="form-section"><h4>Products</h4><p>{type === "FREE_GOODS" ? "What is bought, and what is given free (blank = the same product)" : type === "BUNDLE_PRICE" ? "The products in the bundle and how many of each" : "The products the discount applies to"}</p></div>
                {errs.items && <p className="pr-err" style={{ color: "var(--danger)" }}>{errs.items}</p>}
                {items.length > 0 && (
                  <div className="table-wrap"><table className="tbl"><thead><tr><th>Product</th><th>Role</th><th className="num">Qty</th><th /></tr></thead><tbody>
                    {items.map((i, k) => (
                      <tr key={`${i.itemId}${i.itemRole}`}><td>{i.label}</td>
                        <td><select value={i.itemRole} disabled={ro} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === k ? { ...x, itemRole: e.target.value } : x)))}>{ITEM_ROLES.filter((r) => (type === "FREE_GOODS" ? r === "BUY" || r === "FREE" : r === DEFAULT_ROLE[type])).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></td>
                        <td className="num"><input inputMode="decimal" value={i.qty} disabled={ro} style={{ width: 80 }} placeholder="—" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === k ? { ...x, qty: e.target.value } : x)))} /></td>
                        <td className="actions">{!ro && <button type="button" className="icon-btn-sm" aria-label="Remove product" onClick={() => setItems((xs) => xs.filter((_, j) => j !== k))}><X /></button>}</td></tr>
                    ))}
                  </tbody></table></div>
                )}
                {!ro && (
                  <div className="cp-mt" style={{ position: "relative" }}>
                    <input placeholder="Add a product: search code or name…" value={pq} onChange={(e) => setPq(e.target.value)} />
                    {pq.trim() && found.length > 0 && (
                      <div className="panel" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, marginTop: 4, padding: 4 }}>
                        {found.map((p) => <button key={p.id} type="button" className="btn ghost sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => {
                          setItems((xs) => [...xs, { itemId: p.id, label: `${p.sku} · ${p.name}`, itemRole: DEFAULT_ROLE[type] ?? "BUY", qty: "" }]); setPq(""); setFound([]); setErrs((e) => ({ ...e, items: "" }));
                        }}><Plus />{p.sku} · {p.name}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="cp-mt">
              <div className="form-section"><h4>Who it is for</h4><p>Customer groups, customers or price tiers; or everyone</p></div>
              <Check label="All customers" checked={Boolean(f.appliesToAll)} disabled={ro} onChange={(e) => set("appliesToAll", e.target.checked)} />
              {errs.eligibility && <p style={{ color: "var(--danger)" }}>{errs.eligibility}</p>}
              <div className="cp-pl-g" style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" }}>
                {who.filter((w) => !f.appliesToAll || w.isExcluded).map((w) => (
                  <span key={`${w.kind}${w.refId}`} className={cn("badge", w.isExcluded ? "danger" : "neutral")}>{w.isExcluded ? "Not " : ""}{w.label}
                    {!ro && <button type="button" className="icon-btn-sm" aria-label={`Remove ${w.label}`} onClick={() => setWho((xs) => xs.filter((x) => x !== w))}><X /></button>}</span>
                ))}
              </div>
              {!ro && (
                <FormGrid>
                  <Field label={f.appliesToAll ? "Exclude a group" : "Customer group"}><select value="" onChange={(e) => { const g = groups.find((x) => x.id === e.target.value); if (g) addWho({ kind: "GROUP", refId: g.id, label: g.name, isExcluded: Boolean(f.appliesToAll) }); }}>
                    <option value="">Add…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
                  <Field label={f.appliesToAll ? "Exclude a tier" : "Price tier"}><select value="" onChange={(e) => { const t = tiers.find((x) => x.code === e.target.value); if (t) addWho({ kind: "TIER", refId: t.code, label: t.name, isExcluded: Boolean(f.appliesToAll) }); }}>
                    <option value="">Add…</option>{tiers.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
                  <Field label={f.appliesToAll ? "Exclude a customer" : "Customer"} full>
                    <div style={{ position: "relative" }}>
                      <input placeholder="Search customers…" value={cq} onChange={(e) => setCq(e.target.value)} />
                      {cq.trim() && custs.length > 0 && (
                        <div className="panel" style={{ position: "absolute", zIndex: 5, left: 0, right: 0, marginTop: 4, padding: 4 }}>
                          {custs.map((c) => <button key={c.id} type="button" className="btn ghost sm" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { addWho({ kind: "CUSTOMER", refId: c.id, label: c.name, isExcluded: Boolean(f.appliesToAll) }); setCq(""); setCusts([]); }}><Plus />{c.code} · {c.name}</button>)}
                        </div>
                      )}
                    </div>
                  </Field>
                </FormGrid>
              )}
            </div>
          </>
        )}
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${scheme?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!scheme) return;
        setConfirm(false);
        setBusy(true);
        try { await deleteScheme(scheme.id, scheme.rowVersion); toast(`${scheme.name} deleted`, { tone: "danger" }); onSaved(); } catch (e) { toast(apiMessage(e, "Could not delete the scheme"), { tone: "danger" }); } finally { setBusy(false); }
      }}>Schemes already applied on documents can only be switched off.</ConfirmDialog>
    </>
  );
}
