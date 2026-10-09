"use client";

import "./landed-cost.css";
import {
  Banknote, Ban, Container, Hash, History, PackageCheck, Pencil, Plus, RotateCcw, Save, Scale, Ship, Stamp, Trash2, TriangleAlert, Weight, X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { allocateLandedCost as spread, type ImportGrn, type LandedCost, type LandedCostList, type PurchaseOptions } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { ApiError } from "@/lib/api/errors";
import {
  allocateLandedCost, cancelLandedCost, createLandedCost, deleteLandedCost, getLandedCost, importGrns, listLandedCosts, postLandedCost, purchaseOptions, updateLandedCost,
} from "../api";

type Basis = "VALUE" | "QTY" | "WEIGHT";
type Can = { create: boolean; edit: boolean; post: boolean };
type Item = { id: string | null; grnLineId: string | null; itemId: string; name: string; sku: string; qty: number; weightKg: number; fobUnitFcy: number };
type Charge = {
  key: number; id: string | null; chargeType: string; description: string; payeeVendorId: string | null; payeeName: string; ratePct: number | null; amount: number;
  isCapitalised: boolean; isClaimable: boolean; claimAccountId: string | null;
};
type Form = {
  docDate: string; vendorId: string; branchId: string; grnId: string; originCountry: string; portOfLoading: string; portOfDischarge: string; shipmentMode: string; containerInfo: string;
  billOfLadingNo: string; gdNo: string; lcRef: string; bankAccountId: string; currencyCode: string; fxRate: string; eta: string; clearedOn: string; cleared: boolean; remarks: string;
  allocationBasis: Basis; items: Item[]; charges: Charge[];
};

const today = () => new Date().toISOString().slice(0, 10);
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const grp = (x: number, dec = 0) => Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const rs = (x: number) => `${x < 0 ? "−" : ""}Rs ${grp(Math.round(x))}`;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fd = (iso: string | null) => (iso ? `${iso.slice(8)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—");
const MODE_LABEL: Record<string, string> = { SEA_FCL: "Sea · FCL", SEA_LCL: "Sea · LCL", AIR: "Air", ROAD: "Road" };
const STATUS: Record<string, [string, string]> = { IN_TRANSIT: ["In transit", "info"], CLEARED: ["Cleared", "good"], POSTED: ["Posted", "violet"], CANCELLED: ["Cancelled", "danger"] };
/** Charges claimed to a posting role when not in cost (Import sales tax → input tax on imports, s.148 → advance tax). */
const ROLE_CLAIM: Record<string, string> = { IMPORT_SALES_TAX: "Input sales tax on imports", INCOME_TAX_148: "Advance tax on imports u/s 148" };
const SEG: Record<string, [string, string]> = { goods: ["Goods (FOB)", "var(--primary)"], duty: ["Customs & duties", "var(--orange)"], frt: ["Freight & haulage", "var(--blue)"], clr: ["Clearing & port", "var(--violet)"], ins: ["Insurance", "var(--mint)"] };
const segOf = (t: string) => (["OCEAN_FREIGHT", "INLAND_HAULAGE", "CONTAINER_DETENTION"].includes(t) ? "frt"
  : ["CLEARING_FORWARDING", "PORT_HANDLING", "DEMURRAGE", "BANK_CHARGES", "LAB_TESTING", "OTHER"].includes(t) ? "clr" : t === "INSURANCE" ? "ins" : "duty");
/** Template "Add" menu: common extra costs. */
const QUICK: [string, string, string][] = [
  ["DEMURRAGE", "Demurrage", "Karachi Port Trust"], ["CONTAINER_DETENTION", "Container detention", "Shipping line"], ["BANK_CHARGES", "Bank LC charges", "Bank"],
  ["EXCISE_CESS", "Excise & taxation (infrastructure cess)", "Sindh Excise"], ["LAB_TESTING", "Lab testing (PSQCA)", "PSQCA"],
];

let seq = 0;
const fobOf = (i: Item, fx: number) => r2(i.qty * i.fobUnitFcy * fx);
const errText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const toForm = (s: LandedCost): Form => ({
  docDate: s.docDate, vendorId: s.vendor.id, branchId: s.branch.id, grnId: s.grn?.id ?? "", originCountry: s.originCountry, portOfLoading: s.portOfLoading ?? "", portOfDischarge: s.portOfDischarge ?? "",
  shipmentMode: s.shipmentMode, containerInfo: s.containerInfo ?? "", billOfLadingNo: s.billOfLadingNo ?? "", gdNo: s.gdNo ?? "", lcRef: s.lcRef ?? "", bankAccountId: s.bankAccount?.id ?? "",
  currencyCode: s.currencyCode, fxRate: String(s.fxRate), eta: s.eta ?? "", clearedOn: s.clearedOn ?? "", cleared: s.status === "CLEARED" || s.status === "POSTED", remarks: s.remarks ?? "",
  allocationBasis: s.allocationBasis as Basis,
  items: s.items.map((i) => ({ id: i.id, grnLineId: i.grnLineId, itemId: i.item.id, name: i.item.name, sku: i.item.sku, qty: i.qty, weightKg: i.weightKg, fobUnitFcy: i.fobUnitFcy })),
  charges: s.charges.map((c) => ({
    key: ++seq, id: c.id, chargeType: c.chargeType, description: c.description, payeeVendorId: c.payeeVendor?.id ?? null, payeeName: c.payeeName, ratePct: c.ratePct, amount: c.amount,
    isCapitalised: c.isCapitalised, isClaimable: c.isClaimable, claimAccountId: c.claimAccount?.id ?? null,
  })),
});
const toBody = (f: Form) => ({
  docDate: f.docDate, vendorId: f.vendorId, branchId: f.branchId, grnId: f.grnId || null, originCountry: f.originCountry.trim().toUpperCase(), portOfLoading: f.portOfLoading || null,
  portOfDischarge: f.portOfDischarge || null, shipmentMode: f.shipmentMode, containerInfo: f.containerInfo || null, billOfLadingNo: f.billOfLadingNo || null, gdNo: f.gdNo || null, lcRef: f.lcRef || null,
  bankAccountId: f.bankAccountId || null, currencyCode: f.currencyCode.trim().toUpperCase(), fxRate: Number(f.fxRate), eta: f.eta || null, clearedOn: f.cleared ? f.clearedOn || null : f.clearedOn || null,
  allocationBasis: f.allocationBasis, cleared: f.cleared, remarks: f.remarks || null,
  items: f.items.map((i) => ({ id: i.id, grnLineId: i.grnLineId, itemId: i.itemId, qty: i.qty, weightKg: i.weightKg, fobUnitFcy: i.fobUnitFcy })),
  charges: f.charges.map((c) => ({
    id: c.id, chargeType: c.chargeType, description: c.description, payeeVendorId: c.payeeVendorId, payeeName: c.payeeName, ratePct: c.ratePct, amount: c.amount,
    isCapitalised: c.isCapitalised, isClaimable: !c.isCapitalised && c.isClaimable, claimAccountId: c.isCapitalised ? null : c.claimAccountId,
  })),
});

/** Template app/purchases/landed-cost (4A-company-plus.html + 9A-company-plus.js §8): import shipments, allocation, cost lines, journal preview and posting. */
export function LandedCostScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [o, setO] = useState<PurchaseOptions | null>(null);
  const [list, setList] = useState<LandedCostList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [doc, setDoc] = useState<LandedCost | null>(null);
  const [docErr, setDocErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: "new" | "edit"; form: Form } | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);

  const openDoc = useCallback((id: string | null) => {
    setSelId(id);
    setDocErr(null);
    if (!id) { setDoc(null); setDraft(null); return; }
    getLandedCost(id)
      .then((d) => { setDoc(d); setDraft(toForm(d)); setDirty(false); setShowHistory(false); })
      .catch((e: unknown) => setDocErr(errText(e, "Could not load the shipment")));
  }, []);
  /** Reloads the shipment cards; on the first load (nothing selected) the first open shipment is opened. */
  const loadList = useCallback((first = false) => listLandedCosts({ pageSize: 60 }).then((l) => {
    setList(l);
    if (first) openDoc(l.items.find((x) => x.status !== "CANCELLED")?.id ?? l.items[0]?.id ?? null);
  }), [openDoc]);
  useEffect(() => {
    Promise.all([purchaseOptions().then(setO), loadList(true)])
      .catch((e: unknown) => setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load shipments" }));
  }, [loadList, attempt]);

  const open = !!doc && (doc.status === "IN_TRANSIT" || doc.status === "CLEARED");
  const editable = open && can.edit;
  const fx = draft ? Number(draft.fxRate) || 0 : 0;

  // ---------------------------------------------------------------- live allocation (same maths as the server)
  const A = useMemo(() => {
    if (!draft) return { rows: [], fob: 0, cap: 0, clm: 0 };
    const items = draft.items.map((i) => ({ ...i, fobAmount: fobOf(i, fx) }));
    const cap = r2(draft.charges.filter((c) => c.isCapitalised).reduce((s, c) => s + c.amount, 0));
    const clm = r2(draft.charges.filter((c) => !c.isCapitalised).reduce((s, c) => s + c.amount, 0));
    const al = spread(items, draft.allocationBasis, items.length ? cap : 0);
    const rows = items.map((i, k) => ({ ...i, sharePct: al[k]!.sharePct, alloc: al[k]!.allocatedAmount, landed: (i.fobAmount + al[k]!.allocatedAmount) / i.qty, base: i.fobAmount / i.qty, up: i.fobAmount ? (al[k]!.allocatedAmount / i.fobAmount) * 100 : 0 }));
    return { rows, fob: r2(items.reduce((s, i) => s + i.fobAmount, 0)), cap, clm };
  }, [draft, fx]);
  const segs = useMemo(() => {
    const s: Record<string, number> = { goods: A.fob, duty: 0, frt: 0, clr: 0, ins: 0 };
    draft?.charges.filter((c) => c.isCapitalised).forEach((c) => { s[segOf(c.chargeType)] = (s[segOf(c.chargeType)] ?? 0) + c.amount; });
    return s;
  }, [A.fob, draft]);
  const segTotal = Object.values(segs).reduce((a, b) => a + b, 0) || 1;

  const vendorName = (id: string | null) => o?.vendors.find((v) => v.id === id)?.name;
  const accountName = (id: string | null) => { const a = o?.accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : null; };
  const journal = useMemo(() => {
    if (!draft) return { lines: [] as [string, number, number, string][], dr: 0, cr: 0 };
    const lines: [string, number, number, string][] = A.rows.map((a) => [`Stock in trade · ${a.sku}`, r2(a.fobAmount + a.alloc), 0, "Landed"]);
    draft.charges.filter((c) => !c.isCapitalised && c.amount > 0).forEach((c) => lines.push([accountName(c.claimAccountId) ?? ROLE_CLAIM[c.chargeType] ?? "Claim account", c.amount, 0, c.isClaimable ? "Claimable" : "Expensed"]));
    lines.push(["Goods received not invoiced (FOB)", 0, A.fob, doc?.grn?.docNo ?? ""]);
    const cr: Record<string, number> = {};
    draft.charges.filter((c) => c.amount > 0).forEach((c) => {
      const k = c.payeeVendorId ? `Payables · ${vendorName(c.payeeVendorId) ?? c.payeeName}` : `Landed cost clearing · ${c.payeeName}`;
      cr[k] = r2((cr[k] ?? 0) + c.amount);
    });
    Object.entries(cr).forEach(([k, v]) => lines.push([k, 0, v, ""]));
    return { lines, dr: r2(lines.reduce((s, l) => s + l[1], 0)), cr: r2(lines.reduce((s, l) => s + l[2], 0)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, A, doc, o]);

  // ---------------------------------------------------------------- edits on the selected shipment
  const edit = (f: (d: Form) => Form) => { setDraft((d) => (d ? f(d) : d)); setDirty(true); };
  const setCharge = (key: number, patch: Partial<Charge>) => edit((d) => ({ ...d, charges: d.charges.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  const removeCharge = (key: number) => {
    const prev = draft;
    const gone = draft?.charges.find((c) => c.key === key);
    edit((d) => ({ ...d, charges: d.charges.filter((c) => c.key !== key) }));
    toast(`${gone?.description ?? "Cost"} removed`, { tone: "info", action: { label: "Undo", onClick: () => setDraft(prev) } });
  };
  const addMenu = (anchor: HTMLElement) => setMenu({
    anchor,
    items: [
      ...QUICK.map(([t, l, p]): MenuItem => ({ label: l, icon: <Plus />, onClick: () => edit((d) => ({ ...d, charges: [...d.charges, { key: ++seq, id: null, chargeType: t, description: l, payeeVendorId: null, payeeName: p, ratePct: null, amount: 0, isCapitalised: true, isClaimable: false, claimAccountId: null }] })) })),
      { sep: true },
      { label: "Other cost… (full form)", icon: <Pencil />, onClick: () => doc && draft && setEditor({ mode: "edit", form: draft }) },
    ],
  });
  const changeBasis = async (b: Basis) => {
    if (!draft || b === draft.allocationBasis) return;
    if (!doc || !editable || dirty) { edit((d) => ({ ...d, allocationBasis: b })); return; }
    setBusy("basis");
    try {
      const d = await allocateLandedCost(doc.id, doc.rowVersion, b);
      setDoc(d); setDraft(toForm(d)); setDirty(false);
    } catch (e) { toast(errText(e, "Could not re-allocate"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const persist = async (f: Form): Promise<LandedCost | null> => {
    if (!doc) return null;
    try {
      const d = await updateLandedCost(doc.id, { ...toBody(f), rowVersion: doc.rowVersion });
      setDoc(d); setDraft(toForm(d)); setDirty(false);
      void loadList();
      return d;
    } catch (e) {
      toast(errText(e, "Could not save the shipment"), { tone: "danger" });
      return null;
    }
  };
  const saveDraft = async () => { if (!draft) return; setBusy("save"); const d = await persist(draft); setBusy(null); if (d) toast(`${d.docNo} saved`, { tone: "good" }); };
  const doPost = async () => {
    if (!doc || !draft) return;
    setBusy("post");
    try {
      const cur = dirty ? await persist(draft) : doc;
      if (!cur) return;
      const d = await postLandedCost(cur.id, cur.rowVersion);
      setDoc(d); setDraft(toForm(d)); setPostOpen(false);
      void loadList();
      toast(`${d.voucher?.docNo ?? d.docNo} posted · ${rs(d.capitalisedAmount)} capitalised to stock`, { tone: "good" });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      toast(code === "LANDED_COST_GRN_NOT_POSTED" ? "Link a posted import GRN before posting." : code === "LANDED_COST_UNALLOCATED" ? "The allocation doesn't match the charges in cost. Re-run the allocation." : errText(e, "Could not post"), { tone: "danger" });
    } finally { setBusy(null); }
  };
  const doCancel = async (reason: string) => {
    if (!doc) return;
    setBusy("cancel");
    try {
      const d = await cancelLandedCost(doc.id, doc.rowVersion, reason);
      setDoc(d); setDraft(toForm(d)); setCancelOpen(false); void loadList();
      toast(`${d.docNo} cancelled · landed cost reversed`, { tone: "good" });
    } catch (e) { toast(errText(e, "Could not cancel"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const doDelete = async () => {
    if (!doc) return;
    setBusy("delete");
    try {
      await deleteLandedCost(doc.id, doc.rowVersion);
      setDelOpen(false); toast(`${doc.docNo} deleted`, { tone: "good" });
      openDoc(null); await loadList(true);
    } catch (e) { toast(errText(e, "Could not delete"), { tone: "danger" }); } finally { setBusy(null); }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => { setError(null); setAttempt((a) => a + 1); }} />;

  const head = (
    <div className="page-head lc-head">
      <div>
        <div className="eyebrow"><Ship />Purchases / Landed Cost</div>
        <h1>Landed Cost</h1>
        <p>Spread customs duty, freight, clearing and insurance across imported items so stock carries its true cost. Import sales tax and Section 148 tax stay claimable.</p>
      </div>
      <div className="head-actions">
        <Link className="btn secondary" href="/purchases/grn"><PackageCheck />GRNs</Link>
        {can.create && o && <button type="button" className="btn secondary" onClick={() => setEditor({ mode: "new", form: blankForm(o) })} title="New import shipment"><Plus />New</button>}
        {can.post && <button type="button" className="btn primary" disabled={!open || !!busy} onClick={() => setPostOpen(true)}><Stamp />Post landed cost</button>}
      </div>
    </div>
  );
  if (!list || !o) return <>{head}<div className="stack"><Skeleton style={{ height: 96 }} /><Skeleton style={{ height: 380 }} /></div></>;

  return (
    <>
      {head}
      {!list.items.length ? (
        <div className="panel"><EmptyState icon={<Ship />} title="No import shipments yet" description="Post an import goods receipt (GRN marked as import), then create a shipment for its duties, freight and clearing."
          action={can.create ? <button type="button" className="btn primary" onClick={() => setEditor({ mode: "new", form: blankForm(o) })}><Plus />New shipment</button> : undefined} /></div>
      ) : (
        <>
          <div className="cp-ships">
            {list.items.map((s) => (
              <button type="button" key={s.id} className={cn("cp-ship", s.id === selId && "on")} onClick={() => { if (s.id !== selId && (!dirty || window.confirm("Discard unsaved changes to this shipment?"))) openDoc(s.id); }}>
                <span className="cp-flag">{s.originCountry}</span>
                <div><b>Shipment {s.docNo}</b><small>from {s.originCountry} · {MODE_LABEL[s.shipmentMode] ?? s.shipmentMode}{s.containerInfo ? ` · ${s.containerInfo}` : ""}</small>
                  <small className="cp-ship-p"><Ship />{[s.portOfLoading, s.portOfDischarge].filter(Boolean).join(" → ") || s.vendor.name}</small></div>
                <div className="cp-ship-r"><span className={cn("badge dot", STATUS[s.status]?.[1] ?? "neutral")}>{STATUS[s.status]?.[0] ?? s.status}</span><b>{rs(s.fobAmount)}</b><small>FOB · landed {rs(s.landedValueAmount)}</small></div>
              </button>
            ))}
          </div>

          {docErr ? <ErrorState message={docErr} onRetry={() => openDoc(selId)} /> : !doc || !draft ? <Skeleton style={{ height: 420 }} /> : (
            <>
              <div className="panel cp-lc-doc">
                <div className="cp-lc-dh">
                  <span className="icon-tile blue"><Container /></span>
                  <div><small>{doc.grn?.docNo ?? "No GRN linked"} · {doc.vendor.name}</small><b>Shipment {doc.docNo} from {doc.originCountry}</b></div>
                  <span className="spacer" />
                  {doc.status === "POSTED" && doc.voucher ? <Link className="badge violet" href={`/accounting/vouchers/${doc.voucher.id}`}><Stamp />Posted · {doc.voucher.docNo}</Link>
                    : <span className={cn("badge dot", STATUS[doc.status]?.[1])}>{STATUS[doc.status]?.[0] ?? doc.status}</span>}
                  {editable && <button type="button" className="btn ghost sm" onClick={() => setEditor({ mode: "edit", form: draft })}><Pencil />Edit</button>}
                  {open && can.create && <button type="button" className="btn ghost sm" onClick={() => setDelOpen(true)}><Trash2 />Delete</button>}
                  {doc.status === "POSTED" && can.post && <button type="button" className="btn ghost sm" onClick={() => setCancelOpen(true)}><Ban />Cancel</button>}
                  <button type="button" className={cn("btn ghost sm", showHistory && "active")} onClick={() => setShowHistory((h) => !h)}><History />History</button>
                </div>
                <div className="dl grid3 cp-lc-dl">
                  <div><span>Bill of lading</span><b>{doc.billOfLadingNo ?? "—"}</b></div>
                  <div><span>Goods declaration (WeBOC)</span><b>{doc.gdNo ?? "Pending filing"}</b></div>
                  <div><span>LC / TT</span><b>{doc.lcRef ?? "—"}</b></div>
                  <div><span>Exchange rate</span><b>{doc.currencyCode} 1 = Rs {doc.fxRate.toFixed(2)}</b></div>
                  <div><span>Route</span><b>{[doc.portOfLoading, doc.portOfDischarge].filter(Boolean).join(" → ") || "—"}</b></div>
                  <div><span>Status</span><b>{doc.status === "CANCELLED" ? `Cancelled · ${doc.cancelReason ?? ""}` : doc.clearedOn ? `Cleared ${fd(doc.clearedOn)}` : doc.eta ? `ETA ${fd(doc.eta)}` : "In transit"}</b></div>
                </div>
                {dirty && editable && (
                  <div className="lc-dirty"><TriangleAlert /><span>Unsaved changes to cost lines or allocation.</span><span className="spacer" />
                    <button type="button" className="btn ghost sm" onClick={() => { setDraft(toForm(doc)); setDirty(false); }}><RotateCcw />Discard</button>
                    <button type="button" className="btn primary sm" disabled={!!busy} onClick={saveDraft}><Save />{busy === "save" ? "Saving…" : "Save changes"}</button>
                  </div>
                )}
              </div>
              {showHistory && <div className="panel"><HistoryTab schema="Purchases" table="LandedCostShipments" id={doc.id} /></div>}

              <div className="split cp-lc-split">
                <div className="stack cp-lc-main">
                  <div className="panel flush">
                    <div className="panel-head"><div><h3>Allocation</h3><p>Capitalised costs spread across the GRN lines</p></div>
                      <div className="panel-actions"><span className="muted small cp-hide-sm">Allocate by</span>
                        <div className="seg">
                          {([["VALUE", Banknote, "Value"], ["QTY", Hash, "Qty"], ["WEIGHT", Weight, "Weight"]] as const).map(([b, I, l]) => (
                            <button type="button" key={b} className={cn(draft.allocationBasis === b && "active")} disabled={!editable || busy === "basis"} onClick={() => changeBasis(b)}><I />{l}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table className="tbl compact cp-lc-tbl" data-plain="">
                        <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Weight</th><th className="num">Base cost</th><th className="num">Share</th><th className="num">Allocated</th><th className="num">Landed unit cost</th></tr></thead>
                        <tbody>
                          {!A.rows.length ? <tr><td colSpan={7}><EmptyState icon={<PackageCheck />} title="No items" description={editable ? "Edit the shipment and link its import GRN to load the items." : "This shipment has no items."} /></td></tr>
                            : A.rows.map((a, k) => (
                              <tr key={a.id ?? k}>
                                <td><b>{a.name}</b><small>{a.sku} · {draft.currencyCode} {a.fobUnitFcy.toFixed(2)} / unit</small></td>
                                <td className="num">{grp(a.qty, a.qty % 1 ? 2 : 0)}</td>
                                <td className="num">{grp(a.weightKg, 1)} kg</td>
                                <td className="num">{grp(a.fobAmount)}</td>
                                <td className="num"><span className="cp-share"><span className="t"><i style={{ width: `${a.sharePct.toFixed(1)}%` }} /></span><b>{a.sharePct.toFixed(1)}%</b></span></td>
                                <td className="num cp-lc-alloc">{grp(a.alloc)}</td>
                                <td className="num"><b data-v="landed">Rs {grp(a.landed, 2)}</b><small data-v="up">+{a.up.toFixed(1)}% on {grp(a.base)}</small></td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot><tr><td>Total</td><td className="num">{grp(A.rows.reduce((s, a) => s + a.qty, 0))}</td><td className="num">{grp(A.rows.reduce((s, a) => s + a.weightKg, 0), 1)} kg</td><td className="num">{grp(A.fob)}</td><td className="num">100%</td><td className="num">{grp(A.cap)}</td><td className="num" /></tr></tfoot>
                      </table>
                    </div>
                  </div>
                  <div className="panel">
                    <div className="panel-head"><div><h3>Cost composition</h3><p>What this shipment really cost, landed</p></div><div className="cp-lc-total"><small>Total landed value</small><b>{rs(A.fob + A.cap)}</b></div></div>
                    <div className="cp-lc-stack">
                      {Object.keys(SEG).map((k) => { const p = (segs[k]! / segTotal) * 100; return <i key={k} title={`${SEG[k]![0]}: ${rs(segs[k]!)} (${p.toFixed(1)}%)`} style={{ background: SEG[k]![1], width: `${p}%` }}><span>{p >= 6 ? `${p.toFixed(0)}%` : ""}</span></i>; })}
                    </div>
                    <div className="cp-lc-leg">
                      {Object.keys(SEG).map((k) => <div key={k}><i style={{ background: SEG[k]![1] }} /><span>{SEG[k]![0]}</span><b>{rs(segs[k]!)}</b></div>)}
                      <div className="cp-lc-leg-x"><i /><span>Claimable taxes (outside cost)</span><b>{rs(A.clm)}</b></div>
                    </div>
                  </div>
                </div>
                <div className="panel flush cp-lc-costs">
                  <div className="panel-head"><div><h3>Cost lines</h3><p>Duties, freight and services on this shipment</p></div>{editable && <button type="button" className="btn ghost sm" onClick={(e) => addMenu(e.currentTarget)}><Plus />Add</button>}</div>
                  <div className="table-wrap">
                    <table className="tbl compact cp-lc-ctbl" data-plain="">
                      <thead><tr><th>Cost</th><th className="num">Amount (Rs)</th><th>In cost</th><th /></tr></thead>
                      <tbody>
                        {!draft.charges.length ? <tr><td colSpan={4} className="muted small" style={{ padding: 16 }}>No cost lines yet{editable ? " — use Add." : "."}</td></tr> : draft.charges.map((c) => (
                          <tr key={c.key} className={cn(!c.isCapitalised && "cp-excl", ROLE_CLAIM[c.chargeType] && "cp-claim")}>
                            <td><b>{c.description}</b><small>{c.payeeVendorId ? vendorName(c.payeeVendorId) ?? c.payeeName : c.payeeName}</small>
                              {!c.isCapitalised && <span className="badge info cp-claimb" title={accountName(c.claimAccountId) ?? ROLE_CLAIM[c.chargeType] ?? ""}><RotateCcw />{c.isClaimable || ROLE_CLAIM[c.chargeType] ? "Claimable" : "Expensed"}</span>}</td>
                            <td className="num"><input className="cp-lc-amt num" inputMode="decimal" disabled={!editable} value={c.amount ? String(c.amount) : ""} placeholder="0" aria-label={c.description}
                              onChange={(e) => setCharge(c.key, { amount: Math.max(0, Number(e.target.value.replace(/[^\d.]/g, "")) || 0) })} /></td>
                            <td className="cp-lc-inc"><label className="switch sm" title="Include in landed cost"><input type="checkbox" checked={c.isCapitalised} disabled={!editable} onChange={(e) => {
                              const on = e.target.checked;
                              if (!on && !ROLE_CLAIM[c.chargeType] && !c.claimAccountId) { toast("Choose the account this cost is claimed or expensed to (Edit › cost lines).", { tone: "warn" }); setEditor({ mode: "edit", form: { ...draft, charges: draft.charges.map((x) => (x.key === c.key ? { ...x, isCapitalised: false, isClaimable: true } : x)) } }); return; }
                              setCharge(c.key, { isCapitalised: on, isClaimable: !on });
                              if (on && ROLE_CLAIM[c.chargeType]) toast(`${c.description} is normally claimable. Including it will overstate stock cost.`, { tone: "warn" });
                            }} /><i /></label></td>
                            <td>{editable && <button type="button" className="icon-btn-sm cp-lc-x" title="Remove" onClick={() => removeCharge(c.key)}><X /></button>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="cp-lc-sum">
                    <div><span>Capitalised to stock</span><b>{rs(A.cap)}</b></div>
                    <div><span>Claimable taxes (not in cost)</span><b>{rs(A.clm)}</b></div>
                    <div className="tot"><span>Uplift on FOB</span><b>{A.fob ? ((A.cap / A.fob) * 100).toFixed(1) : "0.0"}%</b></div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="Post landed cost" subtitle={doc ? `${doc.grn?.docNo ?? "No GRN"} · ${doc.vendor.name}` : undefined} foot={
        <><button type="button" className="btn secondary" onClick={() => setPostOpen(false)}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy === "post"} onClick={doPost}><Stamp />{busy === "post" ? "Posting…" : "Post journal"}</button></>
      }>
        <div className="cp-jv">
          <div className="cp-jv-h"><div><small>Journal preview · {fd(draft?.clearedOn || draft?.docDate || today())}</small><b>Landed cost, Shipment {doc?.docNo}</b></div>
            <span className={cn("badge", Math.abs(journal.dr - journal.cr) < 0.01 ? "good" : "danger")}>{Math.abs(journal.dr - journal.cr) < 0.01 ? <><Scale />Balanced</> : <><TriangleAlert />Out of balance</>}</span></div>
          <div className="table-wrap"><table className="tbl compact" data-plain="">
            <thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>
              {journal.lines.map((l, i) => <tr key={i} className="cp-jv-r" style={{ ["--i" as string]: i }}><td>{l[0]}{l[3] && <small>{l[3]}</small>}</td><td className="num dr">{l[1] ? grp(l[1], 2) : ""}</td><td className="num cr">{l[2] ? grp(l[2], 2) : ""}</td></tr>)}
              <tr className="total"><td>Total</td><td className="num">{grp(journal.dr, 2)}</td><td className="num">{grp(journal.cr, 2)}</td></tr>
            </tbody>
          </table></div>
          <p className="small muted cp-mt8">Basis: <b>{{ VALUE: "Value", QTY: "Quantity", WEIGHT: "Weight" }[draft?.allocationBasis ?? "VALUE"]}</b>. Item average costs are revalued from today; the share of units already sold goes to cost of goods sold.{dirty ? " Unsaved changes are saved first." : ""}</p>
        </div>
      </Modal>
      <CancelModal open={cancelOpen} busy={busy === "cancel"} docNo={doc?.docNo ?? ""} onClose={() => setCancelOpen(false)} onConfirm={doCancel} />
      <ConfirmDialog open={delOpen} onClose={() => setDelOpen(false)} onConfirm={doDelete} title={`Delete ${doc?.docNo ?? "shipment"}?`} confirmLabel="Delete" danger busy={busy === "delete"}>
        The shipment, its items and cost lines are removed. Nothing has been posted yet.
      </ConfirmDialog>
      {editor && <ShipmentEditor o={o} mode={editor.mode} initial={editor.form} rowVersion={doc?.rowVersion ?? 0} docId={editor.mode === "edit" ? doc?.id ?? null : null} currentGrn={doc?.grn ?? null}
        onClose={() => setEditor(null)} onSaved={(d) => { setEditor(null); setDoc(d); setDraft(toForm(d)); setDirty(false); setSelId(d.id); void loadList(); }} />}
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}

function blankForm(o: PurchaseOptions): Form {
  return {
    docDate: today(), vendorId: o.vendors.find((v) => v.currencyCode !== "PKR")?.id ?? o.vendors[0]?.id ?? "", branchId: o.branches[0]?.id ?? "", grnId: "", originCountry: "", portOfLoading: "",
    portOfDischarge: "Karachi", shipmentMode: "SEA_FCL", containerInfo: "", billOfLadingNo: "", gdNo: "", lcRef: "", bankAccountId: "", currencyCode: "USD", fxRate: "", eta: "", clearedOn: "", cleared: false,
    remarks: "", allocationBasis: "VALUE", items: [],
    charges: [
      { key: ++seq, id: null, chargeType: "CUSTOMS_DUTY", description: "Customs duty", payeeVendorId: null, payeeName: "Pakistan Customs", ratePct: null, amount: 0, isCapitalised: true, isClaimable: false, claimAccountId: null },
      { key: ++seq, id: null, chargeType: "IMPORT_SALES_TAX", description: "Sales tax at import (18%)", payeeVendorId: null, payeeName: "Pakistan Customs", ratePct: 18, amount: 0, isCapitalised: false, isClaimable: true, claimAccountId: null },
      { key: ++seq, id: null, chargeType: "INCOME_TAX_148", description: "Income tax u/s 148", payeeVendorId: null, payeeName: "Pakistan Customs", ratePct: null, amount: 0, isCapitalised: false, isClaimable: true, claimAccountId: null },
      { key: ++seq, id: null, chargeType: "OCEAN_FREIGHT", description: "Ocean freight", payeeVendorId: null, payeeName: "", ratePct: null, amount: 0, isCapitalised: true, isClaimable: false, claimAccountId: null },
      { key: ++seq, id: null, chargeType: "CLEARING_FORWARDING", description: "Clearing & forwarding agent", payeeVendorId: null, payeeName: "", ratePct: null, amount: 0, isCapitalised: true, isClaimable: false, claimAccountId: null },
    ],
  };
}

function CancelModal({ open, busy, docNo, onClose, onConfirm }: { open: boolean; busy: boolean; docNo: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const short = reason.trim().length < 3;
  return (
    <Modal open={open} onClose={onClose} title={`Cancel ${docNo}`} subtitle="Reverses the landed-cost journal and takes the charges back out of average cost." foot={
      <><button type="button" className="btn secondary" onClick={onClose}>Keep it</button>
        <button type="button" className="btn danger" disabled={busy || short} onClick={() => onConfirm(reason.trim())}><Ban />{busy ? "Cancelling…" : "Cancel shipment"}</button></>
    }>
      <label className="field"><span>Reason <em>*</em></span><textarea rows={3} maxLength={300} value={reason} placeholder="e.g. Wrong GD, re-filed" onChange={(e) => setReason(e.target.value)} /></label>
    </Modal>
  );
}

/** New / edit shipment: header, linked import GRN → items, and full cost lines (payee, rate, claim account). */
function ShipmentEditor({ o, mode, initial, rowVersion, docId, currentGrn, onClose, onSaved }: {
  o: PurchaseOptions; mode: "new" | "edit"; initial: Form; rowVersion: number; docId: string | null; currentGrn: { id: string; docNo: string } | null;
  onClose: () => void; onSaved: (d: LandedCost) => void;
}) {
  const toast = useToast();
  const [f, setF] = useState<Form>(initial);
  const [grns, setGrns] = useState<ImportGrn[] | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { importGrns().then(setGrns).catch(() => setGrns([])); }, []);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const fx = Number(f.fxRate) || 0;

  const linkGrn = (id: string) => {
    const g = grns?.find((x) => x.id === id);
    if (!g) { set("grnId", id); return; }
    const rate = fx || 1;
    setF((x) => ({
      ...x, grnId: id, vendorId: g.vendor.id,
      items: g.lines.map((l) => ({ id: null, grnLineId: l.id, itemId: l.item.id, name: l.item.name, sku: l.item.sku, qty: l.acceptedQty, weightKg: r2((l.item.weightKg ?? 0) * l.acceptedQty), fobUnitFcy: Math.round((l.unitCost / rate) * 10_000) / 10_000 })),
    }));
    if (!fx) toast("Enter the exchange rate, then re-link the GRN to convert its unit costs to FOB.", { tone: "info" });
  };
  const setItem = (k: number, patch: Partial<Item>) => setF((x) => ({ ...x, items: x.items.map((i, n) => (n === k ? { ...i, ...patch } : i)) }));
  const setCh = (key: number, patch: Partial<Charge>) => setF((x) => ({ ...x, charges: x.charges.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!f.vendorId) e.vendorId = "Choose the supplier";
    if (!f.branchId) e.branchId = "Choose the branch";
    if (!/^[A-Za-z]{2}$/.test(f.originCountry.trim())) e.originCountry = "Two-letter country code, e.g. CN";
    if (!(fx > 0)) e.fxRate = "Enter the exchange rate";
    if (f.cleared && !f.clearedOn) e.clearedOn = "Enter the clearing date";
    f.charges.forEach((c, i) => {
      if (!c.description.trim()) e[`charges.${i}.description`] = "Describe the charge";
      if (!c.payeeName.trim() && !c.payeeVendorId) e[`charges.${i}.payeeName`] = "Who is paid";
      if (!c.isCapitalised && !c.claimAccountId && !ROLE_CLAIM[c.chargeType]) e[`charges.${i}.claimAccountId`] = "Choose the account";
    });
    setErrs(e);
    if (Object.keys(e).length) { toast(Object.values(e)[0]!, { tone: "danger" }); return; }
    setBusy(true);
    try {
      const body = toBody({ ...f, charges: f.charges.map((c) => ({ ...c, payeeName: c.payeeName.trim() || o.vendors.find((v) => v.id === c.payeeVendorId)?.name || "" })) });
      const d = mode === "new" ? await createLandedCost(body) : await updateLandedCost(docId!, { ...body, rowVersion });
      toast(`${d.docNo} ${mode === "new" ? "created" : "saved"}`, { tone: "good" });
      onSaved(d);
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrs(Object.fromEntries(Object.entries(err.details).map(([k, v]) => [k, v[0] ?? err.message])));
      toast(errText(err, "Could not save the shipment"), { tone: "danger" });
    } finally { setBusy(false); }
  };

  const bad = (k: string) => (errs[k] ? "pd-bad" : undefined);
  const grnChoices = [...(currentGrn && !grns?.some((g) => g.id === currentGrn.id) ? [{ id: currentGrn.id, docNo: currentGrn.docNo, vendor: { name: "linked" } }] : []), ...(grns ?? [])];
  const capitalised = f.charges.filter((c) => c.isCapitalised).reduce((s, c) => s + c.amount, 0);
  return (
    <Drawer open onClose={onClose} wide title={mode === "new" ? "New import shipment" : "Edit shipment"} subtitle="Link the posted import GRN; its items carry the allocation" className="lc-editor" foot={
      <><button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy} onClick={submit}><Save />{busy ? "Saving…" : mode === "new" ? "Create shipment" : "Save shipment"}</button></>
    }>
      <div className="form-grid c2">
        <label><span>Supplier *</span><select value={f.vendorId} className={bad("vendorId")} onChange={(e) => set("vendorId", e.target.value)}><option value="">Choose…</option>{o.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label><span>Branch *</span><select value={f.branchId} className={bad("branchId")} onChange={(e) => set("branchId", e.target.value)}>{o.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label><span>Shipment date *</span><input type="date" value={f.docDate} onChange={(e) => set("docDate", e.target.value)} /></label>
        <label><span>Import GRN</span><select value={f.grnId} className={bad("grnId")} onChange={(e) => linkGrn(e.target.value)}>
          <option value="">{grns === null ? "Loading…" : "Not linked yet"}</option>
          {grnChoices.map((g) => <option key={g.id} value={g.id}>{g.docNo} · {g.vendor.name}</option>)}
        </select></label>
        <label><span>Origin country *</span><input value={f.originCountry} maxLength={2} className={bad("originCountry")} placeholder="CN" onChange={(e) => set("originCountry", e.target.value.toUpperCase())} /></label>
        <label><span>Mode *</span><select value={f.shipmentMode} onChange={(e) => set("shipmentMode", e.target.value)}>{Object.entries(MODE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label><span>Port of loading</span><input value={f.portOfLoading} maxLength={80} placeholder="Ningbo" onChange={(e) => set("portOfLoading", e.target.value)} /></label>
        <label><span>Port of discharge</span><input value={f.portOfDischarge} maxLength={80} placeholder="Karachi (KICT)" onChange={(e) => set("portOfDischarge", e.target.value)} /></label>
        <label><span>Container</span><input value={f.containerInfo} maxLength={120} placeholder="1 × 40ft HC" onChange={(e) => set("containerInfo", e.target.value)} /></label>
        <label><span>Bill of lading</span><input value={f.billOfLadingNo} maxLength={60} onChange={(e) => set("billOfLadingNo", e.target.value)} /></label>
        <label><span>Goods declaration (GD)</span><input value={f.gdNo} maxLength={60} onChange={(e) => set("gdNo", e.target.value)} /></label>
        <label><span>LC / TT ref</span><input value={f.lcRef} maxLength={60} onChange={(e) => set("lcRef", e.target.value)} /></label>
        <label><span>LC bank account</span><select value={f.bankAccountId} onChange={(e) => set("bankAccountId", e.target.value)}><option value="">None</option>{o.bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select></label>
        <label><span>Currency / FX rate *</span><div style={{ display: "flex", gap: 6 }}><input value={f.currencyCode} maxLength={3} style={{ width: 70 }} onChange={(e) => set("currencyCode", e.target.value.toUpperCase())} /><input type="number" min="0" step="0.0001" value={f.fxRate} className={bad("fxRate")} placeholder="278.40" onChange={(e) => set("fxRate", e.target.value)} /></div></label>
        <label><span>ETA</span><input type="date" value={f.eta} onChange={(e) => set("eta", e.target.value)} /></label>
        <label><span>Cleared</span><div style={{ display: "flex", gap: 8, alignItems: "center" }}><label className="switch"><input type="checkbox" checked={f.cleared} onChange={(e) => setF((x) => ({ ...x, cleared: e.target.checked, clearedOn: e.target.checked && !x.clearedOn ? today() : x.clearedOn }))} /><i /></label>
          <input type="date" value={f.clearedOn} className={bad("clearedOn")} disabled={!f.cleared} onChange={(e) => set("clearedOn", e.target.value)} /></div></label>
        <label className="span-2"><span>Remarks</span><input value={f.remarks} maxLength={500} onChange={(e) => set("remarks", e.target.value)} /></label>
      </div>

      <h4 className="lc-h4">Items <small className="muted">FOB in {f.currencyCode || "FCY"} × rate = base cost in Rs</small></h4>
      {!f.items.length ? <p className="muted small">Link the import GRN to load its received items.</p> : (
        <div className="table-wrap"><table className="tbl compact" data-plain="">
          <thead><tr><th>Item</th><th className="num">Qty</th><th className="num">Weight kg</th><th className="num">FOB / unit ({f.currencyCode})</th><th className="num">Base cost (Rs)</th><th /></tr></thead>
          <tbody>{f.items.map((i, k) => (
            <tr key={k}>
              <td><b>{i.name}</b><small className="muted"> {i.sku}</small></td>
              <td className="num"><input className="num lc-in" type="number" min="0" value={i.qty} onChange={(e) => setItem(k, { qty: Number(e.target.value) || 0 })} /></td>
              <td className="num"><input className="num lc-in" type="number" min="0" value={i.weightKg} onChange={(e) => setItem(k, { weightKg: Number(e.target.value) || 0 })} /></td>
              <td className="num"><input className="num lc-in" type="number" min="0" step="0.0001" value={i.fobUnitFcy} onChange={(e) => setItem(k, { fobUnitFcy: Number(e.target.value) || 0 })} /></td>
              <td className="num">{grp(fobOf(i, fx), 2)}</td>
              <td><button type="button" className="icon-btn-sm" title="Remove" onClick={() => setF((x) => ({ ...x, items: x.items.filter((_, n) => n !== k) }))}><X /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      <h4 className="lc-h4">Cost lines <small className="muted">In cost: capitalised {rs(capitalised)}</small>
        <button type="button" className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setF((x) => ({ ...x, charges: [...x.charges, { key: ++seq, id: null, chargeType: "OTHER", description: "", payeeVendorId: null, payeeName: "", ratePct: null, amount: 0, isCapitalised: true, isClaimable: false, claimAccountId: null }] }))}><Plus />Add cost</button></h4>
      <div className="table-wrap"><table className="tbl compact lc-ch" data-plain="">
        <thead><tr><th>Type</th><th>Description</th><th>Payee</th><th className="num">Rate %</th><th className="num">Amount (Rs)</th><th>In cost</th><th>Claim / expense account</th><th /></tr></thead>
        <tbody>{f.charges.map((c, i) => (
          <tr key={c.key}>
            <td><select value={c.chargeType} onChange={(e) => setCh(c.key, { chargeType: e.target.value, ...(ROLE_CLAIM[e.target.value] ? { isCapitalised: false, isClaimable: true } : {}) })}>{o.chargeTypes.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}</select></td>
            <td><input value={c.description} maxLength={200} className={bad(`charges.${i}.description`)} onChange={(e) => setCh(c.key, { description: e.target.value })} /></td>
            <td><div style={{ display: "flex", gap: 4 }}>
              <select value={c.payeeVendorId ?? ""} style={{ width: 120 }} onChange={(e) => setCh(c.key, { payeeVendorId: e.target.value || null, payeeName: e.target.value ? o.vendors.find((v) => v.id === e.target.value)?.name ?? c.payeeName : c.payeeName })}>
                <option value="">Not a vendor</option>{o.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <input value={c.payeeName} maxLength={160} placeholder="Payee" className={bad(`charges.${i}.payeeName`)} onChange={(e) => setCh(c.key, { payeeName: e.target.value })} />
            </div></td>
            <td className="num"><input className="num lc-in" type="number" min="0" max="100" value={c.ratePct ?? ""} onChange={(e) => setCh(c.key, { ratePct: e.target.value === "" ? null : Number(e.target.value) })} /></td>
            <td className="num"><input className="num lc-in" type="number" min="0" value={c.amount || ""} placeholder="0" onChange={(e) => setCh(c.key, { amount: Math.max(0, Number(e.target.value) || 0) })} /></td>
            <td><label className="switch sm"><input type="checkbox" checked={c.isCapitalised} onChange={(e) => setCh(c.key, { isCapitalised: e.target.checked, isClaimable: !e.target.checked })} /><i /></label></td>
            <td>{c.isCapitalised ? <span className="muted small">Stock</span> : (
              <select value={c.claimAccountId ?? ""} className={bad(`charges.${i}.claimAccountId`)} onChange={(e) => setCh(c.key, { claimAccountId: e.target.value || null })}>
                <option value="">{ROLE_CLAIM[c.chargeType] ? `Default: ${ROLE_CLAIM[c.chargeType]}` : "Choose…"}</option>
                {o.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
              </select>
            )}</td>
            <td><button type="button" className="icon-btn-sm" title="Remove" onClick={() => setF((x) => ({ ...x, charges: x.charges.filter((y) => y.key !== c.key) }))}><X /></button></td>
          </tr>
        ))}</tbody>
      </table></div>
    </Drawer>
  );
}
