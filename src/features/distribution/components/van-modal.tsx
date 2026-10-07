"use client";

import Link from "next/link";
import { useState } from "react";
import { Warehouse as WarehouseIcon } from "lucide-react";
import { VAN_STATUSES, type RouteOptions, type Van, type VanWarehouse } from "@/shared/distribution";
import { Field, FormGrid } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { RecordModal } from "@/features/hr/components/record-modal";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createVan, createVanStockLocation, deleteVan, setVanStatus, updateVan } from "../api";
import { StaffSelect } from "./route-sheet";

export type VanCan = { create: boolean; edit: boolean; remove: boolean };
export const VAN_STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", MAINTENANCE: "Maintenance", INACTIVE: "Inactive" };

/** Van record (template style: the template only hard-codes VANS for its selects). */
export function VanModal({ van: given, warehouses: listed, options, can, onClose, onSaved, onChanged }: {
  van: Van | null;
  warehouses: VanWarehouse[];
  options: RouteOptions | null;
  can: VanCan;
  onClose: () => void;
  onSaved: () => void;
  /** The van changed on the server but the modal stays open (e.g. its stock location was created). */
  onChanged?: () => void;
}) {
  const toast = useToast();
  // The van as last returned by the server (its rowVersion moves when the stock location is created).
  const [van, setVan] = useState(given);
  const [made, setMade] = useState<VanWarehouse | null>(null);
  const warehouses = made && !listed.some((w) => w.id === made.id) ? [...listed, made] : listed;
  const [f, setF] = useState({
    regNo: van?.regNo ?? "", model: van?.model ?? "", capacityCtn: van ? String(van.capacityCtn) : "", capacityKg: van ? String(van.capacityKg) : "",
    warehouseId: van?.warehouse?.id ?? "", defaultDriverEmployeeId: van?.defaultDriver?.id ?? "", status: van?.status ?? "ACTIVE", remarks: van?.remarks ?? "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const ro = van ? !can.edit : !can.create;
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const free = warehouses.filter((w) => !w.vanId || w.vanId === van?.id);
  const [locating, setLocating] = useState(false);

  const createStockLocation = async () => {
    if (!van) return;
    setLocating(true);
    try {
      const v = await createVanStockLocation(van.id, van.rowVersion);
      setVan(v);
      if (v.warehouse) {
        setMade({ ...v.warehouse, status: "ACTIVE", vanId: v.id });
        setF((x) => ({ ...x, warehouseId: v.warehouse!.id }));
        setErrs((e) => ({ ...e, warehouseId: "" }));
      }
      toast(`${v.warehouse?.code ?? "Stock location"} created for ${v.regNo}`, { tone: "good" });
      onChanged?.();
    } catch (e) { toast(apiMessage(e, "Could not create the stock location"), { tone: "danger" }); } finally { setLocating(false); }
  };

  const save = async () => {
    setBusy(true);
    setErrs({});
    const { status, ...body } = f;
    try {
      if (!van) {
        const v = await createVan({ ...body, status });
        toast(`${v.regNo} added`, { tone: "good" });
      } else {
        let v = await updateVan(van.id, { ...body, rowVersion: van.rowVersion });
        if (status !== van.status) v = await setVanStatus(van.id, status, v.rowVersion);
        toast(`${v.regNo} saved`, { tone: "good" });
      }
      onSaved();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the van"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <RecordModal open onClose={onClose} title={van ? `Edit ${van.regNo}` : "Add van"} subtitle={van ? `${van.model} · ${VAN_STATUS_LABEL[van.status] ?? van.status}` : "A delivery vehicle and the van warehouse that holds its stock"}
      history={van ? { schema: "Distribution", table: "Vans", id: van.id } : null} canSave={!ro} canDelete={!!van && can.remove} busy={busy || locating} saveLabel={van ? "Save van" : "Add van"} onSave={save}
      deleteNote="Only a van no route, load sheet, challan, transfer or stock location uses can be deleted. Otherwise set it inactive."
      onDelete={async () => {
        if (!van) return;
        setBusy(true);
        try { await deleteVan(van.id, van.rowVersion); toast(`${van.regNo} deleted`, { tone: "danger" }); onSaved(); } catch (e) { toast(apiMessage(e, "Could not delete the van"), { tone: "danger" }); } finally { setBusy(false); }
      }}>
      <FormGrid>
        <Field label="Registration no." required error={errs.regNo}><input value={f.regNo} maxLength={20} disabled={ro} placeholder="LES-4471" onChange={(e) => set("regNo", e.target.value.toUpperCase())} /></Field>
        <Field label="Model" required error={errs.model}><input value={f.model} maxLength={80} disabled={ro} placeholder="Hyundai Shehzore" onChange={(e) => set("model", e.target.value)} /></Field>
        <Field label="Capacity (cartons)" required error={errs.capacityCtn}><input inputMode="decimal" value={f.capacityCtn} disabled={ro} onChange={(e) => set("capacityCtn", e.target.value)} /></Field>
        <Field label="Capacity (kg)" required error={errs.capacityKg}><input inputMode="decimal" value={f.capacityKg} disabled={ro} onChange={(e) => set("capacityKg", e.target.value)} /></Field>
        <Field label="Van warehouse" error={errs.warehouseId} hint={van?.warehouse ? <>Its stock is the van&apos;s load · <Link href="/inventory/warehouses">Inventory › Warehouses</Link></>
          : van ? (can.edit ? "No stock location yet: create one for this van, or pick a free van warehouse" : "No stock location yet")
          : "Save the van, then create its stock location here"}>
          <select value={f.warehouseId} disabled={ro || locating} onChange={(e) => set("warehouseId", e.target.value)}>
            <option value="">Not linked</option>
            {free.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
          {van && !van.warehouse && can.edit && (
            <button type="button" className="btn secondary sm" style={{ marginTop: 6, alignSelf: "flex-start" }} disabled={locating || busy} onClick={(e) => { e.preventDefault(); void createStockLocation(); }}>
              <WarehouseIcon />{locating ? "Creating…" : "Create van stock location"}
            </button>
          )}
        </Field>
        <StaffSelect seat="driver" value={f.defaultDriverEmployeeId} options={options} disabled={ro} error={errs.defaultDriverEmployeeId} onChange={(v) => set("defaultDriverEmployeeId", v)} />
        <Field label="Status" error={errs.status}>
          <select value={f.status} disabled={ro} onChange={(e) => set("status", e.target.value)}>{VAN_STATUSES.map((s) => <option key={s} value={s}>{VAN_STATUS_LABEL[s]}</option>)}</select>
        </Field>
        <Field label="Remarks" error={errs.remarks}><input value={f.remarks} maxLength={300} disabled={ro} onChange={(e) => set("remarks", e.target.value)} /></Field>
      </FormGrid>
    </RecordModal>
  );
}
