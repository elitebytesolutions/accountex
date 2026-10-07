"use client";

import { Boxes, Grid3x3, History, Pencil, Plus, Star, Trash2, Warehouse as WarehouseIcon, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { generateBinCodes, suggestWarehouseCode, WAREHOUSE_TYPES, type Warehouse, type WarehouseBin } from "@/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { listBranchOptions, type BranchOption } from "@/features/treasury/api";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  addBin, createWarehouse, deleteBin, deleteWarehouse, generateBins, listWarehouses, setWarehouseActive, updateBin, updateWarehouse, warehouseFormOptions,
} from "../api";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = {
  name: string; code: string; description: string; type: string; branchId: string; managerUserId: string; address: string; city: string;
  capacityPallets: string; inventoryAccountId: string; blockNegativeStock: boolean; isPrimary: boolean;
};
type Options = { managers: { id: string; name: string }[]; accounts: { id: string; code: string; name: string }[] };
type BinDraft = { code: string; rack: string; shelfRow: string; position: string; zone: string };
type Gen = { prefix: string; from: string; to: string; pad: string; rack: string; zone: string };
const LOOKUPS = ["WarehouseType"];
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const emptyBin: BinDraft = { code: "", rack: "", shelfRow: "", position: "", zone: "" };
const emptyGen: Gen = { prefix: "A-", from: "1", to: "20", pad: "2", rack: "", zone: "" };

/**
 * Template app/inventory/warehouses (41-acc-trade.html): KPI cards, one card per warehouse, the "Add Warehouse" fields
 * (here in a wide drawer) plus a Bins section. Stock value and SKUs are real (0 until the stock phases); utilisation needs
 * pallets in use, which nothing records yet, so the cards show capacity only.
 */
export function WarehousesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<Warehouse[] | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [options, setOptions] = useState<Options>({ managers: [], accounts: [] });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [edit, setEdit] = useState<Warehouse | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  const [removing, setRemoving] = useState<Warehouse | null>(null);
  const [bin, setBin] = useState<BinDraft>(emptyBin);
  const [binErr, setBinErr] = useState("");
  const [gen, setGen] = useState<Gen | null>(null);
  const [binEdit, setBinEdit] = useState<(BinDraft & { id: string; rowVersion: number }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listWarehouses(), listBranchOptions(), warehouseFormOptions()])
      .then(([w, b, o]) => {
        if (cancelled) return;
        setRows(w);
        setBranches(b);
        setOptions(o);
        setError(null);
        // Keep the open drawer on the fresh row (bins, rowVersion).
        setEdit((e) => (e && e !== "new" ? (w.find((x) => x.id === e.id) ?? null) : e));
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load warehouses" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const all = useMemo(() => rows ?? [], [rows]);
  const row = edit && edit !== "new" ? edit : null;
  const open = (w: Warehouse | "new") => {
    setEdit(w);
    setErrs({});
    setHistory(false);
    setBin(emptyBin);
    setBinErr("");
    setGen(null);
    setBinEdit(null);
    setForm(w === "new"
      ? { name: "", code: "", description: "", type: "WAREHOUSE", branchId: branches[0]?.id ?? "", managerUserId: "", address: "", city: "", capacityPallets: "500", inventoryAccountId: "", blockNegativeStock: true, isPrimary: !all.length }
      : { name: w.name, code: w.code, description: w.description ?? "", type: w.type, branchId: w.branch?.id ?? "", managerUserId: w.manager?.id ?? "", address: w.address ?? "", city: w.city ?? "",
          capacityPallets: w.capacityPallets?.toString() ?? "", inventoryAccountId: w.inventoryAccount?.id ?? "", blockNegativeStock: w.blockNegativeStock, isPrimary: w.isPrimary });
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, [k]: v } : x));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const body = {
      name: form.name, code: form.code, description: form.description || null, type: form.type === "VAN" ? undefined : form.type, branchId: form.branchId, managerUserId: form.managerUserId || null,
      address: form.address || null, city: form.city || null, capacityPallets: form.capacityPallets.trim() || null, inventoryAccountId: form.inventoryAccountId || null,
      blockNegativeStock: form.blockNegativeStock, isPrimary: form.isPrimary,
    };
    try {
      const w = row ? await updateWarehouse(row.id, { ...body, rowVersion: row.rowVersion }) : await createWarehouse(body);
      toast(`${w.name} ${row ? "saved" : "created"}${row ? "" : " · add its bins below"}`, { tone: "good" });
      if (row) setEdit(null); else open(w);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the warehouse"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (w: Warehouse) => {
    try {
      await setWarehouseActive(w.id, w.status !== "ACTIVE", w.rowVersion);
      toast(`${w.name} ${w.status === "ACTIVE" ? "deactivated" : "activated"}`, { tone: w.status === "ACTIVE" ? "warn" : "good" });
      setEdit(null);
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };
  const binCall = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setBinErr("");
    try {
      await work();
      toast(done, { tone: "good" });
      reload();
      return true;
    } catch (e) {
      const f = apiFieldErrors(e);
      setBinErr(f.code ?? f.prefix ?? f.to ?? apiMessage(e, "Could not save"));
      toast(apiMessage(e, "Could not save"), { tone: "danger" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const blankNull = (b: BinDraft) => ({ code: b.code, rack: b.rack || null, shelfRow: b.shelfRow || null, position: b.position || null, zone: b.zone || null });

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const live = all.filter((w) => w.status === "ACTIVE");
  const value = all.reduce((s, w) => s + w.stockValue, 0), skus = all.reduce((s, w) => s + w.skuCount, 0);
  const bins = all.reduce((s, w) => s + w.bins.length, 0), racks = all.reduce((s, w) => s + w.rackCount, 0);
  const primary = all.find((w) => w.isPrimary);
  const genCodes = gen ? generateBinCodes({ prefix: gen.prefix.toUpperCase(), from: Number(gen.from) || 0, to: Number(gen.to) || 0, pad: Number(gen.pad) || 2 }) : [];
  const writable = row ? can.edit : can.create;

  return (
    <>
      <PageHead
        eyebrow="Inventory / Warehouses"
        title="Warehouses"
        description="Storage locations across branches, their bins and the stock they hold."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>Add Warehouse</Button>}
      />
      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Warehouses</span><span className="icon-well"><WarehouseIcon /></span></div><strong>{rows ? all.length : "…"}</strong><small>{live.length === all.length ? "All active" : `${live.length} active`}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Total Stock Value</span><span className="icon-well"><Boxes /></span></div><strong>{rs(value)}</strong><small>{skus} stock SKUs</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Bins</span><span className="icon-well"><Grid3x3 /></span></div><strong>{bins}</strong><small>{racks} racks</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Primary Warehouse</span><span className="icon-well"><Star /></span></div><strong>{primary?.code ?? "—"}</strong><small>{primary ? primary.name : "Mark one as primary"}</small></div>
      </div>

      {!rows && <div className="card-grid mb">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton style={{ height: 180 }} /></div>)}</div>}
      {rows && !all.length && (
        <div className="panel mb"><EmptyState icon={<WarehouseIcon />} title="No warehouses yet" description="Add the places stock is kept: warehouses and shops, each under a branch, with their bins." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>Add Warehouse</Button>} /></div>
      )}
      {all.length > 0 && (
        <div className="card-grid mb">
          {all.map((w) => (
            <div key={w.id} className="card" style={{ opacity: w.status === "ACTIVE" ? 1 : 0.6 }}>
              <div className="row">
                <span className="icon-well"><WarehouseIcon /></span>
                <div><b>{w.name}</b><small className="muted" style={{ display: "block" }}>{w.code}{w.description ? ` · ${w.description}` : ""}</small></div>
                <span className="spacer" />
                {w.status !== "ACTIVE" ? <span className="badge neutral">Inactive</span> : w.isPrimary ? <span className="badge good">Primary</span> : <span className="badge info">{w.type === "SHOP" ? "Shop" : w.type === "VAN" ? "Van" : "Branch"}</span>}
              </div>
              <p className="small muted mt">{[w.address, w.city].filter(Boolean).join(", ") || w.branch?.name || "—"}</p>
              <div className="row mt"><span className="small">Capacity</span><span className="spacer" /><span className="small">{w.capacityPallets ? <><b>{w.capacityPallets.toLocaleString("en-US")}</b> pallets</> : "—"}</span></div>
              <div className="dl mt">
                <div><span>Stock value</span><b>{rs(w.stockValue)}</b></div>
                <div><span>SKUs</span><b>{w.skuCount}</b></div>
                <div><span>Bins / racks</span><b>{w.bins.length} / {w.rackCount}</b></div>
                <div><span>Manager</span><b>{w.manager?.name ?? "—"}</b></div>
              </div>
              <div className="row mt">
                <span className="small muted">{w.branch?.name ?? ""}</span>
                <span className="spacer" />
                <button type="button" className="btn ghost sm" onClick={() => open(w)}><Pencil />{can.edit ? "Edit" : "View"}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer open={!!edit} onClose={() => setEdit(null)} wide title={row ? row.name : "Add Warehouse"} subtitle={row ? `${row.code} · ${labelOf(lookups, "WarehouseType", row.type)}` : "New storage location"} foot={
        <>
          {row && (
            <span className="row" style={{ marginRight: "auto", gap: 6 }}>
              <button type="button" className="btn ghost" onClick={() => setHistory((h) => !h)}><History />{history ? "Warehouse" : "History"}</button>
              {can.edit && !history && <button type="button" className="btn ghost" onClick={() => toggle(row)}>{row.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>}
              {can.remove && !history && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(row)}><Trash2 />Delete</button>}
            </span>
          )}
          <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>{row ? "Close" : "Cancel"}</button>
          {writable && !history && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save warehouse"}</button>}
        </>
      }>
        {row && history ? <HistoryTab schema="Inventory" table="Warehouses" id={row.id} /> : form && (
          <>
            <FormGrid>
              <Field label="Name" required error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Multan" disabled={!writable}
                onChange={(e) => { const v = e.target.value; setForm((x) => x && ({ ...x, name: v, code: !row && (!x.code || x.code === suggestWarehouseCode(x.name)) ? suggestWarehouseCode(v) : x.code })); }} /></Field>
              <Field label="Code" required error={errs.code} hint="Like WH-MUX"><input value={form.code} placeholder="WH-MUX" disabled={!writable} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
              <Field label="Branch" required error={errs.branchId}>
                <select value={form.branchId} disabled={!writable} onChange={(e) => set("branchId", e.target.value)}>
                  <option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  {row?.branch && !branches.some((b) => b.id === row.branch!.id) && <option value={row.branch.id}>{row.branch.name} (inactive)</option>}
                </select>
              </Field>
              <Field label="Manager" error={errs.managerUserId}>
                <select value={form.managerUserId} disabled={!writable} onChange={(e) => set("managerUserId", e.target.value)}>
                  <option value="">(none)</option>{options.managers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  {row?.manager && !options.managers.some((u) => u.id === row.manager!.id) && <option value={row.manager.id}>{row.manager.name} (inactive)</option>}
                </select>
              </Field>
              <Field label="Type" error={errs.type} hint={form.type === "VAN" ? "A van's stock location (Distribution › Vans)" : "Van stock locations are made from Distribution › Vans"}>
                {form.type === "VAN"
                  ? <select value="VAN" disabled><option value="VAN">{labelOf(lookups, "WarehouseType", "VAN")}</option></select>
                  : <select value={form.type} disabled={!writable} onChange={(e) => set("type", e.target.value)}>{WAREHOUSE_TYPES.map((t) => <option key={t} value={t}>{labelOf(lookups, "WarehouseType", t)}</option>)}</select>}
              </Field>
              <Field label="Description" error={errs.description}><input value={form.description} placeholder="e.g. Main distribution centre" disabled={!writable} onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Address" full error={errs.address}><input value={form.address} disabled={!writable} onChange={(e) => set("address", e.target.value)} /></Field>
              <Field label="City" error={errs.city}><input value={form.city} disabled={!writable} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="Capacity (pallets)" error={errs.capacityPallets}><input inputMode="numeric" value={form.capacityPallets} disabled={!writable} onChange={(e) => set("capacityPallets", e.target.value)} /></Field>
              <Field label="Inventory account" full error={errs.inventoryAccountId} hint="Stock in this warehouse posts here (asset account)">
                <select value={form.inventoryAccountId} disabled={!writable} onChange={(e) => set("inventoryAccountId", e.target.value)}>
                  <option value="">(company default)</option>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
                  {row?.inventoryAccount && !options.accounts.some((a) => a.id === row.inventoryAccount!.id) && <option value={row.inventoryAccount.id}>{row.inventoryAccount.code} {row.inventoryAccount.name}</option>}
                </select>
              </Field>
              <Check full label="Block sales when stock is insufficient" checked={form.blockNegativeStock} disabled={!writable} onChange={(e) => set("blockNegativeStock", e.target.checked)} />
              <Check full label={primary && primary.id !== row?.id ? `Primary warehouse (instead of ${primary.name})` : "Primary warehouse"} checked={form.isPrimary} disabled={!writable} onChange={(e) => set("isPrimary", e.target.checked)} />
            </FormGrid>

            <div className="panel-head" style={{ padding: "18px 0 8px" }}><div><h3>Bins</h3><p>{row ? `${row.bins.length} bins · ${row.rackCount} racks` : "Save the warehouse first, then add its bins"}</p></div>
              {row && can.edit && <button type="button" className="btn ghost sm" onClick={() => setGen(gen ? null : emptyGen)}><Wand2 />{gen ? "Single bin" : "Generate bins"}</button>}
            </div>
            {row && (
              <>
                {can.edit && (gen ? (
                  <div className="form-grid c3" style={{ marginBottom: 12 }}>
                    <Field label="Prefix"><input value={gen.prefix} onChange={(e) => setGen({ ...gen, prefix: e.target.value.toUpperCase() })} /></Field>
                    <Field label="From"><input inputMode="numeric" value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} /></Field>
                    <Field label="To"><input inputMode="numeric" value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} /></Field>
                    <Field label="Digits"><select value={gen.pad} onChange={(e) => setGen({ ...gen, pad: e.target.value })}>{["1", "2", "3"].map((p) => <option key={p}>{p}</option>)}</select></Field>
                    <Field label="Rack"><input value={gen.rack} onChange={(e) => setGen({ ...gen, rack: e.target.value })} /></Field>
                    <Field label="Zone"><input value={gen.zone} onChange={(e) => setGen({ ...gen, zone: e.target.value })} /></Field>
                    <div style={{ display: "flex", alignItems: "flex-end" }}><button type="button" className="btn primary sm" disabled={busy || !genCodes.length}
                      onClick={async () => { if (await binCall(() => generateBins(row.id, { prefix: gen.prefix, from: Number(gen.from), to: Number(gen.to), pad: Number(gen.pad), rack: gen.rack || null, zone: gen.zone || null }), `${genCodes.length} bins created`)) setGen(null); }}>
                      <Plus />Create {genCodes.length > 1 ? `${genCodes[0]} … ${genCodes[genCodes.length - 1]} (${genCodes.length})` : (genCodes[0] ?? "")}
                    </button></div>
                  </div>
                ) : (
                  <div className="form-grid c3" style={{ marginBottom: 12 }}>
                    {(["code", "rack", "shelfRow", "position", "zone"] as const).map((k) => (
                      <Field key={k} label={{ code: "Bin code", rack: "Rack", shelfRow: "Shelf / row", position: "Position", zone: "Zone" }[k]} required={k === "code"}>
                        <input value={bin[k]} placeholder={k === "code" ? "A-01" : ""} onChange={(e) => setBin({ ...bin, [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value })} />
                      </Field>
                    ))}
                    <div style={{ display: "flex", alignItems: "flex-end" }}><button type="button" className="btn secondary sm" disabled={busy || !bin.code.trim()} onClick={async () => { if (await binCall(() => addBin(row.id, blankNull(bin)), `Bin ${bin.code} added`)) setBin(emptyBin); }}><Plus />Add bin</button></div>
                  </div>
                ))}
                {binErr && <p className="small" style={{ color: "var(--danger)", margin: "0 0 8px" }}>{binErr}</p>}
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Bin</th><th>Rack</th><th>Shelf / row</th><th>Position</th><th>Zone</th><th>Active</th><th /></tr></thead>
                    <tbody>
                      {row.bins.map((b: WarehouseBin) => binEdit?.id === b.id ? (
                        <tr key={b.id}>
                          {(["code", "rack", "shelfRow", "position", "zone"] as const).map((k) => <td key={k}><input value={binEdit[k]} style={{ width: "100%", minWidth: 60 }} onChange={(e) => setBinEdit({ ...binEdit, [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value })} /></td>)}
                          <td />
                          <td className="actions">
                            <button type="button" className="btn primary sm" disabled={busy} onClick={async () => { if (await binCall(() => updateBin(b.id, { ...blankNull(binEdit), rowVersion: binEdit.rowVersion }), `Bin ${binEdit.code} saved`)) setBinEdit(null); }}>Save</button>
                            <button type="button" className="btn ghost sm" onClick={() => setBinEdit(null)}>Cancel</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={b.id} className={cn(!b.isActive && "muted")}>
                          <td><b>{b.code}</b></td><td>{b.rack ?? "—"}</td><td>{b.shelfRow ?? "—"}</td><td>{b.position ?? "—"}</td><td>{b.zone ?? "—"}</td>
                          <td><label className="switch"><input type="checkbox" checked={b.isActive} disabled={!can.edit || busy} onChange={() => binCall(() => updateBin(b.id, { isActive: !b.isActive, rowVersion: b.rowVersion }), `Bin ${b.code} ${b.isActive ? "deactivated" : "activated"}`)} aria-label={`Bin ${b.code} active`} /><i /></label></td>
                          <td className="actions">
                            {can.edit && <button type="button" className="icon-btn-sm" aria-label={`Edit bin ${b.code}`} onClick={() => setBinEdit({ id: b.id, rowVersion: b.rowVersion, code: b.code, rack: b.rack ?? "", shelfRow: b.shelfRow ?? "", position: b.position ?? "", zone: b.zone ?? "" })}><Pencil /></button>}
                            {can.remove && <button type="button" className="icon-btn-sm" aria-label={`Delete bin ${b.code}`} onClick={() => binCall(() => deleteBin(b.id, b.rowVersion), `Bin ${b.code} deleted`)}><Trash2 /></button>}
                          </td>
                        </tr>
                      ))}
                      {!row.bins.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 18 }}>No bins yet. Add one, or generate a range like A-01 … A-20.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Drawer>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!removing) return;
        try {
          await deleteWarehouse(removing.id, removing.rowVersion);
          toast(`${removing.name} deleted`, { tone: "good" });
          setEdit(null);
          reload();
        } catch (e) {
          toast(apiMessage(e, "Could not delete"), { tone: "danger" });
        } finally {
          setRemoving(null);
        }
      }}>Only a warehouse no stock or document uses can be deleted (its bins go with it), and the code can&apos;t be used again. Otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
