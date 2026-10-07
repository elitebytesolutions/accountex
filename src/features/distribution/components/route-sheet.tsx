"use client";

import { History, Pencil, Plus, Power, PowerOff, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { WEEKDAYS, weekdayLabel, type Route, type RouteOptions, type RouteSeat, type Weekday } from "@/shared/distribution";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { assignRoute, createRoute, deleteRoute, setRouteActive, updateRoute } from "../api";
import { Sheet } from "./sheet";

export type RouteCan = { create: boolean; edit: boolean; remove: boolean };
type Staff = Record<RouteSeat, string>;
const SEAT_LABEL: Record<RouteSeat, string> = { booker: "Booker", salesman: "Salesman", driver: "Driver", supervisor: "Supervisor" };
const SEAT_ROLE_LABEL: Record<RouteSeat, string> = { booker: "Order Booker", salesman: "Salesman", driver: "Deliveryman", supervisor: "any" };
const FIELD: Record<RouteSeat, string> = { booker: "bookerEmployeeId", salesman: "salesmanEmployeeId", driver: "driverEmployeeId", supervisor: "supervisorEmployeeId" };

/** A staff select; until Phase 11 adds employees with the seat's role it reads "After Phase 11". */
export function StaffSelect({ seat, value, options, disabled, error, onChange }: {
  seat: RouteSeat; value: string; options: RouteOptions | null; disabled?: boolean; error?: string; onChange: (v: string) => void;
}) {
  const list = options?.staff[seat] ?? [];
  const none = !list.length && !value;
  return (
    <Field label={SEAT_LABEL[seat]} error={error} hint={none ? `After Phase 11: needs employees${seat === "supervisor" ? "" : ` with the ${SEAT_ROLE_LABEL[seat]} role`}` : undefined}>
      <select value={value} disabled={disabled || none} onChange={(e) => onChange(e.target.value)}>
        {none ? <option value="">After Phase 11</option> : <><option value="">Not assigned</option>{list.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.code}</option>)}</>}
      </select>
    </Field>
  );
}

/** Template rtNewRoute sheet (code, name, booker, salesman, van, driver, visit days), also used to edit a route. */
export function RouteSheet({ route, nextCode, options, can, onClose, onSaved, onDeleted }: {
  route: Route | null;
  nextCode: string;
  options: RouteOptions | null;
  can: RouteCan;
  onClose: () => void;
  onSaved: (r: Route, created: boolean) => void;
  onDeleted: (r: Route) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(route?.name ?? "");
  const [warehouse, setWarehouse] = useState(route?.sourceWarehouse?.id ?? "");
  const [van, setVan] = useState(route?.van?.id ?? "");
  const [staff, setStaff] = useState<Staff>({ booker: route?.booker?.id ?? "", salesman: route?.salesman?.id ?? "", driver: route?.driver?.id ?? "", supervisor: route?.supervisor?.id ?? "" });
  const [days, setDays] = useState<Weekday[]>(route?.days ?? ["MON", "THU"]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"form" | "history">("form");
  const [confirm, setConfirm] = useState(false);
  const ro = route ? !can.edit : !can.create;

  const toggleDay = (w: Weekday) => setDays((d) => (d.includes(w) ? d.filter((x) => x !== w) : WEEKDAYS.filter((x) => d.includes(x) || x === w)));
  const save = async () => {
    if (name.trim().length < 2) { setErrs({ name: "Give the route a name" }); toast("Give the route a name", { tone: "warn" }); return; }
    if (!days.length) { setErrs({ days: "Pick at least one visit day" }); toast("Pick at least one visit day", { tone: "warn" }); return; }
    setBusy(true);
    setErrs({});
    const seats = Object.fromEntries(Object.entries(staff).map(([k, v]) => [FIELD[k as RouteSeat], v || null]));
    try {
      if (!route) {
        const r = await createRoute({ name, sourceWarehouseId: warehouse || null, vehicleId: van || null, ...seats, days });
        toast(`${r.code} · ${r.name} created. Drag shops onto it below.`, { tone: "good" });
        onSaved(r, true);
        return;
      }
      let r = route;
      const headerChanged = name !== route.name || (warehouse || null) !== (route.sourceWarehouse?.id ?? null) || days.join() !== route.days.join();
      if (headerChanged) r = await updateRoute(route.id, { name, sourceWarehouseId: warehouse || null, days, rowVersion: r.rowVersion });
      const assignChanged = (van || null) !== (route.van?.id ?? null) || (Object.keys(staff) as RouteSeat[]).some((s) => (staff[s] || null) !== (route[s]?.id ?? null));
      if (assignChanged) r = await assignRoute(route.id, { vehicleId: van || null, ...seats, rowVersion: r.rowVersion });
      toast(`${r.code} · ${r.name} saved`, { tone: "good" });
      onSaved(r, false);
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the route"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const toggle = async () => {
    if (!route) return;
    setBusy(true);
    try { const r = await setRouteActive(route.id, route.status !== "ACTIVE", route.rowVersion); toast(`${r.code} ${r.status === "ACTIVE" ? "activated" : "deactivated"}`, { tone: "good" }); onSaved(r, false); } catch (e) { toast(apiMessage(e, "Could not change the route"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <>
      <Sheet open onClose={onClose} title={route ? `${route.code} · ${route.name}` : "New route"} subtitle={route ? `${route.status === "ACTIVE" ? "Active" : "Inactive"} · ${route.shops} shops · ${route.stops.length} stops` : `${nextCode} · define the beat`}
        foot={tab === "history" ? <button type="button" className="btn secondary" onClick={() => setTab("form")}><Pencil />Back to details</button> : (
          <>
            {route && <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>}
            {route && can.remove && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
            <span className="spacer" />
            {route && can.edit && <button type="button" className="btn secondary" disabled={busy} onClick={toggle}>{route.status === "ACTIVE" ? <><PowerOff />Deactivate</> : <><Power />Activate</>}</button>}
            <button type="button" className="btn secondary" onClick={onClose}>{ro ? "Close" : "Cancel"}</button>
            {!ro && <button type="button" className="btn primary" disabled={busy} onClick={save}>{route ? <><Save />{busy ? "Saving…" : "Save route"}</> : <><Plus />{busy ? "Creating…" : "Create route"}</>}</button>}
          </>
        )}>
        {tab === "history" && route ? <HistoryTab schema="Distribution" table="Routes" id={route.id} /> : (
          <>
            <FormGrid>
              <Field label="Route code" hint={route ? undefined : "Numbered on save from the RT series"}><input value={route?.code ?? nextCode} readOnly /></Field>
              <Field label="Route name" required error={errs.name}><input value={name} maxLength={80} disabled={ro} placeholder="e.g. Lahore East (Shalimar/Mughalpura)" onChange={(e) => setName(e.target.value)} /></Field>
              <StaffSelect seat="booker" value={staff.booker} options={options} disabled={ro} error={errs.bookerEmployeeId} onChange={(v) => setStaff((s) => ({ ...s, booker: v }))} />
              <StaffSelect seat="salesman" value={staff.salesman} options={options} disabled={ro} error={errs.salesmanEmployeeId} onChange={(v) => setStaff((s) => ({ ...s, salesman: v }))} />
              <Field label="Van" error={errs.vehicleId} hint={options && !options.vans.length ? "Add a van in the Vans panel first" : undefined}>
                <select value={van} disabled={ro} onChange={(e) => setVan(e.target.value)}>
                  <option value="">No van</option>
                  {options?.vans.map((v) => <option key={v.id} value={v.id} disabled={v.status !== "ACTIVE" && v.id !== van}>{v.regNo} · {v.model}{v.status !== "ACTIVE" ? ` (${v.status.toLowerCase()})` : ""}</option>)}
                </select>
              </Field>
              <StaffSelect seat="driver" value={staff.driver} options={options} disabled={ro} error={errs.driverEmployeeId} onChange={(v) => setStaff((s) => ({ ...s, driver: v }))} />
              <Field label="Loads from" error={errs.sourceWarehouseId}>
                <select value={warehouse} disabled={ro} onChange={(e) => setWarehouse(e.target.value)}>
                  <option value="">Not set</option>
                  {options?.warehouses.filter((w) => w.type !== "VAN").map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
                </select>
              </Field>
              <StaffSelect seat="supervisor" value={staff.supervisor} options={options} disabled={ro} error={errs.supervisorEmployeeId} onChange={(v) => setStaff((s) => ({ ...s, supervisor: v }))} />
            </FormGrid>
            <div className="ds-nr-days">
              <span className="small muted">Visit days</span>
              <div className="ds-daychips" role="group" aria-label="Visit days">
                {WEEKDAYS.map((w) => <button key={w} type="button" className={cn(days.includes(w) && "on")} aria-pressed={days.includes(w)} disabled={ro} onClick={() => toggleDay(w)}>{weekdayLabel(w)}</button>)}
              </div>
              {errs.days && <small className="hint text-danger" role="alert">{errs.days}</small>}
            </div>
          </>
        )}
      </Sheet>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${route?.code} · ${route?.name}?`} confirmLabel="Delete" danger busy={busy} onConfirm={async () => {
        if (!route) return;
        setConfirm(false);
        setBusy(true);
        try { await deleteRoute(route.id, route.rowVersion); toast(`${route.code} deleted`, { tone: "danger" }); onDeleted(route); } catch (e) { toast(apiMessage(e, "Could not delete the route"), { tone: "danger" }); } finally { setBusy(false); }
      }}>Only a route with no shops, bookings, load sheets or invoices can be deleted. Otherwise deactivate it.</ConfirmDialog>
    </>
  );
}
