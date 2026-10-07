"use client";

import { ArrowLeft, History, MapPin, Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ShopArea } from "@/shared/distribution";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { createShopArea, deleteShopArea, setShopAreaActive, updateShopArea } from "../api";
import type { RouteCan } from "./route-sheet";

type Mode = { kind: "list" } | { kind: "form"; area: ShopArea | null } | { kind: "history"; area: ShopArea };

/** "Manage areas" (template style: the template has no area screen; areas show as chips on the shop board). */
export function AreasModal({ areas, can, onClose, onChanged }: { areas: ShopArea[]; can: RouteCan; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [f, setF] = useState({ code: "", name: "", city: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ShopArea | null>(null);

  const open = (a: ShopArea | null) => { setF({ code: a?.code ?? "", name: a?.name ?? "", city: a?.city ?? "" }); setErrs({}); setMode({ kind: "form", area: a }); };
  const run = async (work: () => Promise<unknown>, done: string, back = true) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); onChanged(); if (back) setMode({ kind: "list" }); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the area"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const editing = mode.kind === "form" ? mode.area : null;
  const ro = editing ? !can.edit : !can.create;

  const foot = mode.kind === "list" ? (
    <><span className="spacer" /><button type="button" className="btn secondary" onClick={onClose}>Close</button>{can.create && <button type="button" className="btn primary" onClick={() => open(null)}><Plus />Add area</button>}</>
  ) : mode.kind === "history" ? (
    <button type="button" className="btn secondary" onClick={() => setMode({ kind: "list" })}><ArrowLeft />Back to areas</button>
  ) : (
    <>
      {editing && <button type="button" className="btn ghost" onClick={() => setMode({ kind: "history", area: editing })}><History />History</button>}
      {editing && can.remove && <button type="button" className="btn ghost" onClick={() => setConfirm(editing)}><Trash2 />Delete</button>}
      <span className="spacer" />
      {editing && can.edit && <button type="button" className="btn secondary" disabled={busy} onClick={() => run(() => setShopAreaActive(editing.id, editing.status !== "ACTIVE", editing.rowVersion), `${editing.name} ${editing.status === "ACTIVE" ? "deactivated" : "activated"}`)}>{editing.status === "ACTIVE" ? <><PowerOff />Deactivate</> : <><Power />Activate</>}</button>}
      <button type="button" className="btn secondary" onClick={() => setMode({ kind: "list" })}>Back</button>
      {!ro && <button type="button" className="btn primary" disabled={busy} onClick={() => run(() => (editing ? updateShopArea(editing.id, { ...f, rowVersion: editing.rowVersion }) : createShopArea(f)), editing ? `${f.name} saved` : `${f.name} added`)}>{busy ? "Saving…" : editing ? "Save area" : "Add area"}</button>}
    </>
  );

  return (
    <>
      <Modal open onClose={onClose} title={mode.kind === "list" ? "Shop areas" : mode.kind === "history" ? `${mode.area.name} · history` : editing ? `Edit ${editing.name}` : "Add area"}
        subtitle={mode.kind === "list" ? "Group shops on the board by neighbourhood. A shop's area is set on its card." : undefined} foot={foot}>
        {mode.kind === "history" ? <HistoryTab schema="Distribution" table="ShopAreas" id={mode.area.id} /> : mode.kind === "form" ? (
          <FormGrid>
            <Field label="Name" required error={errs.name}><input value={f.name} maxLength={80} disabled={ro} placeholder="Gulberg" onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
            <Field label="City" error={errs.city}><input value={f.city} maxLength={60} disabled={ro} placeholder="Lahore" onChange={(e) => setF((x) => ({ ...x, city: e.target.value }))} /></Field>
            <Field label="Code" error={errs.code} hint="Optional, like GLB"><input value={f.code} maxLength={20} disabled={ro} onChange={(e) => setF((x) => ({ ...x, code: e.target.value.toUpperCase() }))} /></Field>
          </FormGrid>
        ) : areas.length ? (
          <div className="table-wrap"><table className="tbl ds-tbl" data-plain>
            <thead><tr><th>Area</th><th>City</th><th className="num">Shops</th><th>Status</th><th /></tr></thead>
            <tbody>{areas.map((a) => (
              <tr key={a.id} className={a.status === "ACTIVE" ? undefined : "ds-dim"}>
                <td><b>{a.name}</b>{a.code && <> <span className="ds-sku">{a.code}</span></>}</td>
                <td>{a.city ?? <span className="zero">—</span>}</td>
                <td className="num">{a.shops}</td>
                <td><span className={`badge ${a.status === "ACTIVE" ? "good" : "neutral"}`}>{a.status === "ACTIVE" ? "Active" : "Inactive"}</span></td>
                <td className="num"><button type="button" className="icon-btn-sm" aria-label={`Open ${a.name}`} onClick={() => open(a)}><Pencil /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon={<MapPin />} title="No areas yet" description={can.create ? "Add areas such as Gulberg or Model Town, then tag shops with them on the board." : "Areas your team adds appear here."} />}
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={`Delete ${confirm?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        const a = confirm;
        setConfirm(null);
        if (a) await run(() => deleteShopArea(a.id, a.rowVersion), `${a.name} deleted`);
      }}>Only an area no shop uses can be deleted. Otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
