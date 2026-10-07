"use client";

import { ChevronDown, Database, FileText, Info, PackagePlus, RotateCcw, Save, ScanBarcode, Tag, WandSparkles, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ean13CheckDigit, marginPct, type ProductDetail } from "@/shared";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createProduct, nextSku, productOptions, updateProduct, type ProductOptions } from "../products-api";

type F = Record<string, string | boolean>;
const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** A random in-house EAN-13 (prefix 200–299 is reserved for in-store use). */
const genEan = () => { const body = `2${String(Math.floor(Math.random() * 1e11)).padStart(11, "0")}`; return body + ean13CheckDigit(body); };

function init(p: ProductDetail | null): F {
  const piece = p?.barcodes.find((b) => b.kind === "PIECE" && b.isPrimary), ctn = p?.barcodes.find((b) => b.kind === "CARTON" && b.isPrimary);
  return {
    sku: p?.sku ?? "", upc: s(p?.upc), name: p?.name ?? "", ctn: p ? String(p.ctn) : "", uomId: p?.uom.id ?? "", manufacturerId: p?.company?.id ?? "",
    distributorVendorId: p?.distributor?.id ?? "", defaultShelf: s(p?.defaultShelf), bcPiece: piece?.barcode ?? "", bcCtn: ctn?.barcode ?? "",
    cost: p ? String(p.cost) : "", price: p ? String(p.price) : "", wprice: s(p?.wprice), high: p ? String(p.highLevel) : "", low: p ? String(p.lowLevel) : "",
    fin: p ? String(p.finDiscPct) : "", gstRate: p ? String(p.gstRate) : "18", taxCodeId: p?.taxCode?.id ?? "",
    productClassId: p?.productClass?.id ?? "", productSubclassId: p?.subclass?.id ?? "", nameUrdu: s(p?.nameUrdu),
    isShort: p?.isShort ?? false, trackExpiry: p?.trackExpiry ?? false, isControlled: p?.isControlled ?? false, isPrecious: p?.isPrecious ?? false,
  };
}

/** Template margin chip (9F-products.js): ok ≥ 10 %, low under 10 %, bad below cost. */
function MarginChip({ label, v, hint }: { label: string; v: number | null; hint?: string }) {
  return <span className={cn("pr-mchip", v === null ? "" : v < 0 ? "bad" : v < 10 ? "low" : "ok")}><small>{label}</small><b>{v === null ? "—" : `${v}%`}</b>{hint && <em>{hint}</em>}</span>;
}

/** Template `#pr-new` (4B-products.html): New / Edit Product with the three collapsible sections. No image drop zone yet (no file storage). */
export function ProductForm({ product, onClose, onSaved }: { product: ProductDetail | null; onClose: () => void; onSaved: (p: ProductDetail) => void }) {
  const toast = useToast();
  const [opts, setOpts] = useState<ProductOptions | null>(null);
  const [f, setF] = useState<F>(() => init(product));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState({ basic: true, pricing: true, cls: true });
  const [busy, setBusy] = useState<"" | "draft" | "save">("");

  useEffect(() => {
    let cancelled = false;
    productOptions().then((o) => !cancelled && setOpts(o)).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v, ...(k === "productClassId" && { productSubclassId: "" }) })); setErrs((e) => ({ ...e, [k]: "" })); };
  const str = (k: string) => String(f[k] ?? "");
  const n = (k: string) => Number(str(k)) || 0;
  const unit = opts?.units.find((u) => u.id === f.uomId);
  const cls = opts?.classes.find((c) => c.id === f.productClassId);
  const ctn = Math.max(1, n("ctn") || 1);
  const genSku = async () => {
    const prefix = cls?.name.replace(/[^A-Za-z]/g, "").slice(0, 2) || "SK";
    try { set("sku", (await nextSku(prefix)).sku); } catch (e) { toast(apiMessage(e, "Could not suggest a code"), { tone: "danger" }); }
  };
  const err = (k: string) => (errs[k] ? <small className="pr-err">{errs[k]}</small> : <small className="pr-err" />);
  const ff = (k: string, label: string, child: React.ReactNode, o?: { req?: boolean; className?: string }) => (
    <label className={cn("pr-ff", errs[k] && "err", o?.className)}><span>{label}{o?.req && <em>*</em>}</span>{child}{err(k)}</label>
  );
  const input = (k: string, placeholder: string, extra?: { type?: string; step?: string; max?: number; inputMode?: "numeric" | "decimal"; upper?: boolean }) => (
    <input name={k} value={str(k)} placeholder={placeholder} type={extra?.type} step={extra?.step} maxLength={extra?.max} inputMode={extra?.inputMode}
      onChange={(e) => set(k, extra?.upper ? e.target.value.toUpperCase() : e.target.value)} />
  );

  const save = async (draft: boolean) => {
    setBusy(draft ? "draft" : "save");
    setErrs({});
    const body: Record<string, unknown> = {
      sku: f.sku, upc: f.upc || null, name: f.name, nameUrdu: f.nameUrdu || null, status: draft ? "DRAFT" : product && product.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      manufacturerId: f.manufacturerId || null, distributorVendorId: f.distributorVendorId || null, productClassId: f.productClassId || null,
      productSubclassId: f.productSubclassId || null, uomId: f.uomId, ctn: f.ctn || 1, defaultShelf: f.defaultShelf || null,
      cost: f.cost || 0, price: f.price || 0, wprice: f.wprice || null, gstRate: f.gstRate || 18, taxCodeId: f.taxCodeId || null, finDiscPct: f.fin || 0,
      lowLevel: f.low || 0, highLevel: f.high || 0, isShort: f.isShort, trackExpiry: f.trackExpiry, isControlled: f.isControlled, isPrecious: f.isPrecious,
    };
    if (!product) body.barcodes = [
      ...(f.bcPiece ? [{ barcode: f.bcPiece, kind: "PIECE", qtyPerScan: 1, isPrimary: true }] : []),
      ...(f.bcCtn ? [{ barcode: f.bcCtn, kind: "CARTON", qtyPerScan: ctn, isPrimary: true }] : []),
    ];
    try {
      const p = product ? await updateProduct(product.id, { ...body, rowVersion: product.rowVersion }) : await createProduct(body);
      toast(`${p.sku} · ${p.name} ${product ? "saved" : draft ? "saved as draft" : "created"}`, { tone: "good" });
      onSaved(p);
    } catch (e) {
      const fe = apiFieldErrors(e);
      setErrs({ ...fe, ...(fe.lowLevel && { low: fe.lowLevel }), ...(fe.highLevel && { high: fe.highLevel }), ...(fe["barcodes.0.barcode"] && { bcPiece: fe["barcodes.0.barcode"] }) });
      toast(apiMessage(e, "Could not save the product"), { tone: "danger" });
    } finally {
      setBusy("");
    }
  };

  const sec = (key: keyof typeof open, icon: React.ReactNode, title: string, sub: string, body: React.ReactNode) => (
    <div className={cn("pr-sec", open[key] && "open")}>
      <button type="button" className="pr-sec-h" aria-expanded={open[key]} onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
        <span className="pr-sec-ic">{icon}</span><span><b>{title}</b><small>{sub}</small></span><ChevronDown />
      </button>
      <div className="pr-sec-b"><div className="pr-sec-in">{body}</div></div>
    </div>
  );
  const cost = n("cost"), price = n("price"), wprice = n("wprice");

  return createPortal(
    <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pr-modal" role="dialog" aria-modal aria-label={product ? "Edit product" : "New product"}>
        <div className="pr-mhead">
          <span className="pr-cube sm"><PackagePlus /></span>
          <div><h2>{product ? `Edit ${product.sku}` : "New Product"}</h2><p>{product ? product.name : "Add a new product to your inventory"}</p></div>
          <button className="x" type="button" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <form className="pr-mbody" noValidate autoComplete="off" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
          {sec("basic", <FileText />, "Basic Information", "Enter the essential product details", (
            <>
              <div className="pr-fg c3">
                {ff("sku", "Product Code", <div className="pr-inbtn">{input("sku", "Enter product code", { max: 12, upper: true })}<button type="button" className="pr-gen" onClick={genSku} title="Suggest the next code"><WandSparkles />Next</button></div>, { req: true })}
                {ff("upc", "UPC", <div className="pr-inbtn">{input("upc", "Enter UPC code", { max: 13, inputMode: "numeric" })}<button type="button" className="pr-gen" onClick={() => set("upc", genEan())} title="Generate EAN-13"><WandSparkles />Generate</button></div>)}
                {ff("name", "Product Name", input("name", "Enter product name"), { req: true })}
              </div>
              <div className="pr-fg c4">
                {ff("ctn", "Pack (CTN size)", <div className="pr-inaff"><b>CTN</b>{input("ctn", "e.g. 25", { type: "number" })}</div>, { req: true })}
                {ff("uomId", "Loose", <select name="uomId" value={str("uomId")} onChange={(e) => set("uomId", e.target.value)}><option value="">Select loose unit</option>{opts?.units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}</select>, { req: true })}
                {ff("manufacturerId", "Company", <select name="manufacturerId" value={str("manufacturerId")} onChange={(e) => set("manufacturerId", e.target.value)}><option value="">Select company</option>{opts?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{product?.company && !opts?.companies.some((c) => c.id === product.company!.id) && <option value={product.company.id}>{product.company.name} (inactive)</option>}</select>, { req: true })}
                {ff("distributorVendorId", "Distributor", <select name="distributorVendorId" value={str("distributorVendorId")} onChange={(e) => set("distributorVendorId", e.target.value)}><option value="">Select distributor</option>{opts?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>)}
              </div>
              <div className="pr-fg c3">
                {ff("defaultShelf", "Shelf #", input("defaultShelf", "e.g. A1, PR12", { max: 5, upper: true }))}
                <div className="pr-uom span2">
                  <span className="pr-uom-ic"><Database /></span>
                  <div><small>Multi-UoM preview</small>
                    <b>{unit ? (ctn > 1 ? `1 CTN = ${ctn} ${unit.code}` : `Sold by the ${unit.name.toLowerCase()}`) : "Enter a pack size and loose unit"}</b>
                    <em>{unit && price ? (ctn > 1 ? `CTN Rs ${fmt(price * ctn)} · ${unit.code} Rs ${fmt(price)}` : `${unit.code} Rs ${fmt(price)}`) : "Carton and piece prices are worked out live"}</em>
                  </div>
                </div>
              </div>
              {!product && (
                <div className="pr-codes">
                  <div className="pr-codes-h"><b>Barcodes</b><small>Piece and carton codes print on labels and scan at the till</small></div>
                  <div className="pr-coderow"><span className="pr-codetag">Piece</span><span className="pr-bcmini" />{input("bcPiece", "Piece barcode (EAN-13)", { max: 13, inputMode: "numeric" })}<button type="button" className="btn secondary sm" onClick={() => set("bcPiece", genEan())}><ScanBarcode />Generate</button></div>
                  <div className="pr-coderow"><span className="pr-codetag ctn">Carton</span><span className="pr-bcmini" />{input("bcCtn", "Carton barcode (ITF / EAN-13)", { max: 14, inputMode: "numeric" })}<button type="button" className="btn secondary sm" onClick={() => set("bcCtn", genEan())}><ScanBarcode />Generate</button></div>
                  {errs.bcPiece && <small className="pr-err" style={{ display: "block" }}>{errs.bcPiece}</small>}
                </div>
              )}
            </>
          ))}
          {sec("pricing", <Database />, "Pricing & Inventory", "Set pricing, stock levels, and other inventory details", (
            <>
              <div className="pr-fg c4">
                {ff("cost", "Purchase Price", input("cost", "Enter purchase price", { type: "number", step: "0.01" }), { req: true })}
                {ff("price", "Retail Price", input("price", "Enter retail price", { type: "number", step: "0.01" }), { req: true })}
                {ff("wprice", "W. Price", input("wprice", "Enter W price", { type: "number", step: "0.01" }))}
                {ff("gstRate", "GST %", input("gstRate", "18", { type: "number", step: "0.5" }))}
              </div>
              <div className="pr-margins">
                <MarginChip label="Retail margin" v={price && cost ? marginPct(price, cost) : null} hint={price && cost ? `Rs ${fmt(price - cost)} / unit` : ""} />
                <MarginChip label="W. margin" v={wprice && cost ? marginPct(wprice, cost) : null} />
                <MarginChip label="Markup" v={price && cost ? Math.round(((price - cost) / cost) * 1000) / 10 : null} />
                {n("fin") > 0 && <MarginChip label={`Net after ${n("fin")}% disc`} v={price && cost ? marginPct(price * (1 - n("fin") / 100), cost) : null} />}
              </div>
              <div className="pr-fg c4">
                {ff("high", "High Level", input("high", "Enter high level", { type: "number" }))}
                {ff("low", "Low Level", input("low", "Enter low level", { type: "number" }))}
                {ff("fin", "% Fin Disc.", input("fin", "Enter discount %", { type: "number", step: "0.5" }))}
                {ff("taxCodeId", "Tax code", <select name="taxCodeId" value={str("taxCodeId")} onChange={(e) => set("taxCodeId", e.target.value)}><option value="">(GST % above)</option>{opts?.taxCodes.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</select>)}
              </div>
            </>
          ))}
          {sec("cls", <Tag />, "Classification", "Assign class, shelf and special attributes", (
            <>
              <div className="pr-classrow">
                <div className="pr-fg c1">
                  {ff("productClassId", "Class", <select name="productClassId" value={str("productClassId")} onChange={(e) => set("productClassId", e.target.value)}><option value="">Select class</option>{opts?.classes.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select>, { req: true })}
                  {ff("productSubclassId", "Sub Type", <select name="productSubclassId" value={str("productSubclassId")} disabled={!cls} onChange={(e) => set("productSubclassId", e.target.value)}><option value="">{cls ? "Select sub type" : "Select a class first"}</option>{cls?.subclasses.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>)}
                  {ff("nameUrdu", "Urdu name", <input name="nameUrdu" dir="rtl" lang="ur" value={str("nameUrdu")} onChange={(e) => set("nameUrdu", e.target.value)} />)}
                </div>
                <fieldset className="pr-attrs">
                  <legend>Special Attributes</legend>
                  <label><input type="checkbox" checked={Boolean(f.isShort)} onChange={(e) => set("isShort", e.target.checked)} /> Short Item <span>(No discount during sale)</span></label>
                  <label><input type="checkbox" checked={Boolean(f.trackExpiry)} onChange={(e) => set("trackExpiry", e.target.checked)} /> Required Expiry <span>(Expiry date must be entered)</span></label>
                  <div className="pr-attrs-row">
                    <label><input type="checkbox" checked={Boolean(f.isControlled)} onChange={(e) => set("isControlled", e.target.checked)} /> Controlled Item</label>
                    <label><input type="checkbox" checked={Boolean(f.isPrecious)} onChange={(e) => set("isPrecious", e.target.checked)} /> Precious Item</label>
                  </div>
                </fieldset>
              </div>
              <div className="pr-notes">
                <span className="pr-notes-ic"><Info /></span>
                <div><b>Important Notes</b><ul>
                  <li><b>Short Item:</b> Discount not allowed on short items during sale.</li>
                  <li><b>Required Expiry:</b> Expiry date must be fed in Purchase Voucher.</li>
                  <li><b>Shelf Name:</b> Use first two characters and then numbers up to three digits (e.g. A1, PR12, CN1).</li>
                  <li><b>Draft:</b> A draft may be priced below cost; it can&apos;t be sold until saved as a product.</li>
                </ul></div>
              </div>
            </>
          ))}
        </form>
        <div className="pr-mfoot">
          <button className="btn ghost" type="button" onClick={() => { setF(init(product)); setErrs({}); }}><RotateCcw />Clear</button>
          <span className="spacer" />
          <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          {(!product || product.status === "DRAFT") && <button className="btn secondary" type="button" disabled={!!busy} onClick={() => save(true)}><FileText />{busy === "draft" ? "Saving…" : "Save Draft"}</button>}
          <button className="btn primary" type="button" disabled={!!busy} onClick={() => save(false)}><Save /><span>{busy === "save" ? "Saving…" : "Save Product"}</span></button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
