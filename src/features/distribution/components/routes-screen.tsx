"use client";

import {
  ArrowDown, ArrowRightLeft, ArrowUp, ClipboardList, Ellipsis, GripVertical, Hand, HandCoins, History, MapPin, Pencil, Plus, Route as RouteIcon,
  Save, Search, Trash2, Trophy, Truck, UserRound, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type DragEvent, type MouseEvent } from "react";
import {
  WEEKDAYS, weekdayLabel, type CommissionSlabsResult, type Route, type RouteOptions, type ShopArea, type ShopProfile, type UnassignedShop, type Van,
  type VanWarehouse, type Weekday,
} from "@/shared/distribution";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { Modal } from "@/components/ui/overlay";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  listCommissionSlabs, listRoutes, listShopAreas, listShopProfiles, listUnassignedShops, listVanWarehouses, listVans, removeShopProfile, routeOptions,
  saveRouteStops, saveShopProfile, updateRoute,
} from "../api";
import { AreasModal } from "./areas-modal";
import { RouteMap } from "./route-map";
import { RouteSheet, type RouteCan } from "./route-sheet";
import { periodLabel, SlabEditor } from "./slab-editor";
import { VAN_STATUS_LABEL, VanModal, type VanCan } from "./van-modal";
import { TargetsLeaderboard, TargetsManager, TargetsPeople, type TargetsCan } from "@/features/distribution-ops/components/targets-panel";

export type RoutesCan = { route: RouteCan; van: VanCan & { view: boolean }; target: { view: boolean; edit: boolean; create?: boolean; approve?: boolean; post?: boolean } };
type DraftStop = { customerId: string; name: string; area: string | null; priceTier: string; weekday: Weekday | null; plannedEta: string };
type Shop = { customerId: string; name: string; code: string; area: string | null; tier: string; profile: ShopProfile | null };

const ROUTE_TONES = ["var(--primary)", "var(--blue)", "var(--orange)", "var(--violet)", "var(--info)", "var(--danger)"];
const TIER_LABEL = (tiers: RouteOptions["priceTiers"] | undefined, code: string) => tiers?.find((t) => t.code === code)?.name ?? code.charAt(0) + code.slice(1).toLowerCase();
const VAN_TONE: Record<string, string> = { ACTIVE: "good", MAINTENANCE: "warn", INACTIVE: "neutral" };
const nextCodeOf = (routes: Route[]) => `RT-${String(Math.max(0, ...routes.map((r) => Number(r.code.slice(3)) || 0)) + 1).padStart(2, "0")}`;

/** An empty sparkline (template `spark()` with no data): monthly sales arrive with invoicing. */
const EmptySpark = () => <svg className="ds-spark" viewBox="0 0 120 36" aria-hidden />;

/**
 * Template app/wholesale/routes (4E-distribution.html boot node, rendered by 9I-distribution.js renderRoutes): route cards
 * with visit-day chips, the route map and ordered stop list, the drag-and-drop shop board, and the commission slab
 * table. Template-style additions: the Vans panel, "Manage areas" and the commission band editor. Sales, targets,
 * leaderboard and commissions stay empty until Phase 26.
 */
export function RoutesScreen({ can }: { can: RoutesCan }) {
  const toast = useToast();
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [profiles, setProfiles] = useState<ShopProfile[]>([]);
  const [areas, setAreas] = useState<ShopArea[]>([]);
  const [options, setOptions] = useState<RouteOptions | null>(null);
  const [vans, setVans] = useState<Van[] | null>(null);
  const [vanWhs, setVanWhs] = useState<VanWarehouse[]>([]);
  const [slabs, setSlabs] = useState<CommissionSlabsResult | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState("all");
  const [sheet, setSheet] = useState<{ route: Route | null } | null>(null);
  const [vanModal, setVanModal] = useState<{ van: Van | null } | null>(null);
  const [areasOpen, setAreasOpen] = useState(false);
  const [slabOpen, setSlabOpen] = useState(false);
  const [history, setHistory] = useState<{ title: string; table: string; id: string } | null>(null);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftStop[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [freeQ, setFreeQ] = useState("");
  const [free, setFree] = useState<UnassignedShop[]>([]);
  const [freeTick, setFreeTick] = useState(0);
  const [shake, setShake] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listRoutes(), listShopProfiles(), listShopAreas(), routeOptions(),
      can.van.view ? Promise.all([listVans(), listVanWarehouses()]) : Promise.resolve(null),
      can.target.view ? listCommissionSlabs() : Promise.resolve(null),
    ]).then(([r, p, a, o, v, s]) => {
      if (cancelled) return;
      setRoutes(r); setProfiles(p); setAreas(a); setOptions(o); setError(null);
      if (v) { setVans(v[0]); setVanWhs(v[1]); }
      setSlabs(s);
      setSel((cur) => (cur && r.some((x) => x.id === cur) ? cur : r[0]?.id ?? null));
    }).catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load routes" }));
    return () => { cancelled = true; };
  }, [attempt, can.van.view, can.target.view]);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { listUnassignedShops(freeQ || undefined).then((x) => !cancelled && setFree(x)).catch(() => undefined); }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [freeQ, freeTick, attempt]);
  const reload = useCallback(() => { setAttempt((n) => n + 1); setFreeTick((n) => n + 1); }, []);
  useEffect(() => { if (!landed) return; const t = setTimeout(() => setLanded(null), 900); return () => clearTimeout(t); }, [landed]);
  useEffect(() => { if (!shake) return; const t = setTimeout(() => setShake(null), 500); return () => clearTimeout(t); }, [shake]);

  const toneOf = useCallback((id: string) => ROUTE_TONES[Math.max(0, routes?.findIndex((r) => r.id === id) ?? 0) % ROUTE_TONES.length]!, [routes]);
  const route = routes?.find((r) => r.id === sel) ?? null;
  const areaName = useCallback((p: ShopProfile) => p.areaName ?? p.customerArea, []);
  const shopsByRoute = useMemo(() => {
    const m = new Map<string, Shop[]>();
    for (const p of profiles) {
      if (areaFilter !== "all" && (areaFilter === "none" ? p.areaId : p.areaId !== areaFilter)) continue;
      const s: Shop = { customerId: p.customerId, name: p.name, code: p.code, area: areaName(p), tier: p.priceTier, profile: p };
      m.set(p.routeId, [...(m.get(p.routeId) ?? []), s]);
    }
    return m;
  }, [profiles, areaFilter, areaName]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!routes) return <div className="ds-boot" aria-busy><span /><span /><span /></div>;

  // ---------------------------------------------------------------- actions
  const toggleDay = async (r: Route, w: Weekday, e: MouseEvent) => {
    e.stopPropagation();
    if (!can.route.edit) return;
    const on = r.days.includes(w);
    if (on && r.days.length === 1) { setShake(`${r.id}:${w}`); toast("A route needs at least one visit day", { tone: "warn" }); return; }
    const days = on ? r.days.filter((x) => x !== w) : WEEKDAYS.filter((x) => r.days.includes(x) || x === w);
    try {
      const u = await updateRoute(r.id, { days, rowVersion: r.rowVersion });
      setRoutes((rs) => rs?.map((x) => (x.id === u.id ? u : x)) ?? rs);
      toast(`${u.code} now visits ${u.days.map(weekdayLabel).join(", ")}`, { tone: "info", ms: 2200 });
    } catch (err) { setShake(`${r.id}:${w}`); toast(apiMessage(err, "Could not change the visit days"), { tone: "danger" }); }
  };

  const moveShop = async (customerId: string, to: string | null, silent = false) => {
    const p = profiles.find((x) => x.customerId === customerId) ?? null;
    if ((p?.routeId ?? null) === to) return;
    const from = p?.routeId ?? null;
    const label = (id: string | null) => (id ? routes.find((r) => r.id === id)?.code ?? "?" : "no route");
    const name = p?.name ?? free.find((f) => f.customerId === customerId)?.name ?? "Shop";
    setBusy(true);
    try {
      if (to) await saveShopProfile(customerId, { routeId: to, ...(p && { rowVersion: p.rowVersion }) });
      else if (p) await removeShopProfile(customerId, p.rowVersion);
      setLanded(customerId);
      reload();
      if (!silent) toast(`${name} moved ${label(from)} → ${label(to)}`, { tone: "good", action: { label: "Undo", onClick: () => { void moveShop(customerId, from, true); } } });
    } catch (e) { toast(apiMessage(e, "Could not move the shop"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const setProfile = async (p: ShopProfile, patch: Record<string, unknown>, done: string) => {
    try { await saveShopProfile(p.customerId, { routeId: p.routeId, rowVersion: p.rowVersion, ...patch }); toast(done, { tone: "good" }); reload(); } catch (e) { toast(apiMessage(e, "Could not update the shop"), { tone: "danger" }); }
  };

  const onDrop = (e: DragEvent, to: string | null) => {
    e.preventDefault();
    setOver(null);
    let code = drag;
    try { code = e.dataTransfer.getData("text/plain") || drag; } catch { /* ok */ }
    setDrag(null);
    if (code && can.route.edit) void moveShop(code, to);
  };
  const dragProps = (col: string) => ({
    onDragOver: (e: DragEvent) => { if (!drag) return; e.preventDefault(); try { e.dataTransfer.dropEffect = "move"; } catch { /* ok */ } setOver(col); },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o === col ? null : o)); },
  });
  const cardDrag = (customerId: string) => can.route.edit ? {
    draggable: true,
    onDragStart: (e: DragEvent) => { setDrag(customerId); try { e.dataTransfer.setData("text/plain", customerId); e.dataTransfer.effectAllowed = "move"; } catch { /* ok */ } },
    onDragEnd: () => { setDrag(null); setOver(null); },
  } : {};

  const routeMenu = (r: Route, anchor: HTMLElement) => setMenu({
    anchor, items: [
      { label: can.route.edit ? "Edit route & staff" : "Open route", icon: <Pencil />, onClick: () => setSheet({ route: r }) },
      { label: "History", icon: <History />, onClick: () => setHistory({ title: `${r.code} · ${r.name}`, table: "Routes", id: r.id }) },
      { sep: true },
      { label: "Build load sheet", icon: <ClipboardList />, disabled: true, onClick: () => undefined },
      { label: "Open recovery sheet", icon: <HandCoins />, disabled: true, onClick: () => undefined },
      { sep: true },
      { label: "Optimise stop order", icon: <RouteIcon />, disabled: true, onClick: () => undefined },
    ],
  });
  const shopMenu = (s: Shop, anchor: HTMLElement) => {
    const p = s.profile;
    const items: MenuItem[] = routes.filter((r) => r.id !== p?.routeId && r.status === "ACTIVE").map((r) => ({ label: `${p ? "Move" : "Put"} on ${r.code} · ${r.name}`, icon: <ArrowRightLeft />, onClick: () => { void moveShop(s.customerId, r.id); } }));
    if (p) {
      if (areas.some((a) => a.status === "ACTIVE")) {
        items.push({ sep: true });
        for (const a of areas.filter((x) => x.status === "ACTIVE")) items.push({ label: `${p.areaId === a.id ? "✓ " : ""}Area: ${a.name}`, icon: <MapPin />, onClick: () => { void setProfile(p, { areaId: a.id }, `${s.name} is in ${a.name}`); } });
        if (p.areaId) items.push({ label: "Clear area", icon: <X />, onClick: () => { void setProfile(p, { areaId: null }, `${s.name} has no area`); } });
      }
      items.push({ sep: true });
      for (const t of options?.priceTiers ?? []) items.push({ label: `${p.priceTier === t.code ? "✓ " : ""}Tier: ${t.name}`, icon: <HandCoins />, onClick: () => { void setProfile(p, { priceTier: t.code }, `${s.name} buys at ${t.name} rates`); } });
      items.push({ sep: true }, { label: "History", icon: <History />, onClick: () => setHistory({ title: s.name, table: "ShopRouteProfiles", id: p.id }) });
      items.push({ label: "Take off route", icon: <Trash2 />, danger: true, onClick: () => { void moveShop(s.customerId, null); } });
    }
    setMenu({ anchor, items: items.filter((x, i, a) => !("sep" in x) || (i > 0 && !("sep" in a[i - 1]!))) });
  };

  // ---------------------------------------------------------------- stops
  const startEdit = () => route && setDraft(route.stops.map((s) => ({ customerId: s.customerId, name: s.name, area: s.area, priceTier: s.priceTier, weekday: s.weekday, plannedEta: s.plannedEta ?? "" })));
  const moveDraft = (i: number, by: number) => setDraft((d) => { if (!d) return d; const j = i + by; if (j < 0 || j >= d.length) return d; const c = [...d]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
  const saveStops = async () => {
    if (!route || !draft) return;
    setBusy(true);
    try {
      const r = await saveRouteStops(route.id, { rowVersion: route.rowVersion, stops: draft.map((s) => ({ customerId: s.customerId, weekday: s.weekday, plannedEta: s.plannedEta || null })) });
      setRoutes((rs) => rs?.map((x) => (x.id === r.id ? r : x)) ?? rs);
      setDraft(null);
      toast(`${r.code} stop order saved · ${r.stops.length} stops`, { tone: "good" });
    } catch (e) { toast(apiMessage(e, "Could not save the stops"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const notInDraft = route && draft ? profiles.filter((p) => p.routeId === route.id && !draft.some((d) => d.customerId === p.customerId && d.weekday === null)) : [];
  const mapStops = draft ?? route?.stops.map((s) => ({ ...s, plannedEta: s.plannedEta ?? "" })) ?? [];

  const current = slabs?.periods.find((p) => p.effectiveFrom === slabs.current) ?? null;
  const targetCan: TargetsCan = { view: can.target.view, create: !!can.target.create, edit: can.target.edit, approve: !!can.target.approve, post: !!can.target.post };
  const freeShops: Shop[] = free.map((f) => ({ customerId: f.customerId, name: f.name, code: f.code, area: f.customerArea ?? f.city, tier: "", profile: null }));

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Wholesale &amp; Distribution / Distribution</div><h1>Routes &amp; Salesmen</h1>
          <p>Beats, visit days and who works them. Drag shops between routes, and see how each booker and salesman is tracking against target.</p></div>
        <div className="head-actions"><span className="tagline">Right shop, right day</span>
          <button type="button" className="btn secondary" disabled title="Load sheets arrive in a later phase"><ClipboardList />Load sheets</button>
          {can.route.create && <button type="button" className="btn primary" onClick={() => setSheet({ route: null })}><Plus />New route</button>}</div>
      </div>

      {routes.length ? (
        <div className="ds-rcards">
          {routes.map((r, i) => (
            <article key={r.id} className={cn("ds-rcard", r.id === sel && "sel", r.status !== "ACTIVE" && "ds-dim")} style={{ ["--i" as string]: i, ["--rt" as string]: toneOf(r.id), ...(r.status !== "ACTIVE" && { opacity: 0.7 }) } as CSSProperties}
              tabIndex={0} role="button" aria-pressed={r.id === sel} onClick={() => { setSel(r.id); setDraft(null); }}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setSel(r.id); setDraft(null); } }}>
              <div className="ds-rc-head"><span className="ds-rt">{r.code}</span><b>{r.name}</b>{r.status !== "ACTIVE" && <span className="badge neutral">Inactive</span>}
                <button type="button" className="icon-btn-sm" aria-label="Route menu" onClick={(e) => { e.stopPropagation(); routeMenu(r, e.currentTarget); }}><Ellipsis /></button></div>
              <div className="ds-daychips" role="group" aria-label="Visit days">
                {WEEKDAYS.map((w) => <button key={w} type="button" className={cn(r.days.includes(w) && "on", shake === `${r.id}:${w}` && "ds-shake")} aria-pressed={r.days.includes(w)} disabled={!can.route.edit} onClick={(e) => toggleDay(r, w, e)}>{weekdayLabel(w)}</button>)}
              </div>
              <div className="ds-rc-people">
                <div><small>Booker</small><b>{r.booker?.name ?? "—"}</b></div><div><small>Salesman</small><b>{r.salesman?.name ?? "—"}</b></div>
                <div><small>Van</small><b>{r.van?.regNo ?? "—"}</b></div><div><small>Driver</small><b>{r.driver?.name ?? "—"}</b></div>
              </div>
              <div className="ds-rc-foot">
                <div><small>Shops</small><b>{r.shops}</b></div>
                <div className="ds-rc-sales"><small>Monthly sales</small><b>—</b></div>
                <EmptySpark />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="panel"><EmptyState icon={<RouteIcon />} title="No routes yet" description={can.route.create ? "Create a route, pick its visit days, then drag shops onto it." : "Routes your team creates appear here."}
          action={can.route.create ? <button type="button" className="btn primary" onClick={() => setSheet({ route: null })}><Plus />New route</button> : undefined} /></div>
      )}

      {route && (
        <div className="panel ds-mappanel">
          <div className="panel-head"><div><h3>Route map · {route.code} {route.name}</h3>
            <p>{route.stops.length ? `${route.stops.length} stops in visit order from ${route.sourceWarehouse?.name ?? "the warehouse"} · ${route.days.map(weekdayLabel).join(" & ") || "no visit days"}${route.van ? ` · van ${route.van.regNo}` : ""}` : "No shops on this route yet"}</p></div>
            <div className="seg">{routes.map((x) => <button key={x.id} type="button" className={x.id === sel ? "active" : undefined} onClick={() => { setSel(x.id); setDraft(null); }}>{x.code}</button>)}</div></div>
          <div className="ds-mapwrap">
            <div className="ds-map"><RouteMap code={route.code} name={route.name} tone={toneOf(route.id)} warehouse={route.sourceWarehouse?.code ?? "Warehouse"} hot={hot} onHot={setHot}
              stops={mapStops.map((s) => ({ key: `${s.weekday ?? "*"}|${s.customerId}`, label: `${s.name}${s.area ? ` · ${s.area}` : ""}` }))} /></div>
            <div>
              <ol className={cn("ds-stops", draft && "ds-editing")}>
                {mapStops.length ? mapStops.map((s, i) => {
                  const key = `${s.weekday ?? "*"}|${s.customerId}`;
                  return (
                    <li key={key} className={hot === key ? "hot" : undefined} style={{ ["--i" as string]: i }} onMouseEnter={() => setHot(key)} onMouseLeave={() => setHot(null)}>
                      <span>{i + 1}</span>
                      <div><b>{s.name}</b><small>{[s.area, TIER_LABEL(options?.priceTiers, s.priceTier), s.weekday ? weekdayLabel(s.weekday) : "Every visit day"].filter(Boolean).join(" · ")}</small>
                        {draft && (
                          <div className="ds-stop-fields">
                            <select aria-label="Visit day" value={s.weekday ?? ""} onChange={(e) => setDraft((d) => d?.map((x, j) => (j === i ? { ...x, weekday: (e.target.value || null) as Weekday | null } : x)) ?? d)}>
                              <option value="">Every visit day</option>{route.days.map((w) => <option key={w} value={w}>{weekdayLabel(w)}</option>)}
                            </select>
                            <input type="time" aria-label="Planned arrival" value={s.plannedEta} onChange={(e) => setDraft((d) => d?.map((x, j) => (j === i ? { ...x, plannedEta: e.target.value } : x)) ?? d)} />
                          </div>
                        )}
                      </div>
                      {draft ? (
                        <div className="ds-stop-act">
                          <button type="button" className="icon-btn-sm" aria-label="Earlier" disabled={i === 0} onClick={() => moveDraft(i, -1)}><ArrowUp /></button>
                          <button type="button" className="icon-btn-sm" aria-label="Later" disabled={i === mapStops.length - 1} onClick={() => moveDraft(i, 1)}><ArrowDown /></button>
                          <button type="button" className="icon-btn-sm" aria-label={`Remove ${s.name}`} onClick={() => setDraft((d) => d?.filter((_, j) => j !== i) ?? d)}><X /></button>
                        </div>
                      ) : <em>{s.plannedEta || "—"}</em>}
                    </li>
                  );
                }) : <li className="nil">No stops</li>}
              </ol>
              {can.route.edit && (
                <div className="ds-stops-foot">
                  {draft ? (
                    <>
                      {notInDraft.length > 0 && (
                        <select aria-label="Add a stop" value="" style={{ width: "auto", minWidth: 0, height: 36 }} onChange={(e) => {
                          const p = profiles.find((x) => x.customerId === e.target.value);
                          if (p) setDraft((d) => [...(d ?? []), { customerId: p.customerId, name: p.name, area: areaName(p), priceTier: p.priceTier, weekday: null, plannedEta: "" }]);
                        }}><option value="">Add a stop…</option>{notInDraft.map((p) => <option key={p.customerId} value={p.customerId}>{p.name}</option>)}</select>
                      )}
                      <button type="button" className="btn secondary sm" onClick={() => setDraft(null)}>Cancel</button>
                      <button type="button" className="btn primary sm" disabled={busy} onClick={saveStops}><Save />{busy ? "Saving…" : "Save order"}</button>
                    </>
                  ) : <button type="button" className="btn secondary sm" onClick={startEdit}><Pencil />Edit stops</button>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-head"><div><h3>Shop assignment</h3><p>Drag a shop card onto another route, or use its menu. Counts, the map and load sheets follow along.</p></div>
          <span className="pill"><Hand />Drag &amp; drop</span></div>
        <div className="ds-areabar">
          <div className="chips" role="group" aria-label="Filter by area">
            <button type="button" className={areaFilter === "all" ? "active" : undefined} onClick={() => setAreaFilter("all")}>All areas <i>{profiles.length}</i></button>
            {areas.filter((a) => a.status === "ACTIVE").map((a) => <button key={a.id} type="button" className={areaFilter === a.id ? "active" : undefined} onClick={() => setAreaFilter(a.id)}>{a.name} <i>{profiles.filter((p) => p.areaId === a.id).length}</i></button>)}
            {areas.length > 0 && <button type="button" className={areaFilter === "none" ? "active" : undefined} onClick={() => setAreaFilter("none")}>No area <i>{profiles.filter((p) => !p.areaId).length}</i></button>}
          </div>
          <button type="button" className="btn secondary sm" onClick={() => setAreasOpen(true)}><MapPin />Manage areas</button>
        </div>
        {routes.length ? (
          <div className={cn("ds-board", drag && "dragging")} style={{ ["--cols" as string]: routes.length + 1 }}>
            {routes.map((r) => {
              const shops = shopsByRoute.get(r.id) ?? [];
              return (
                <div key={r.id} className={cn("ds-col", over === r.id && "over")} style={{ ["--rt" as string]: toneOf(r.id) }} {...dragProps(r.id)} onDrop={(e) => onDrop(e, r.id)}>
                  <div className="ds-col-head"><span className="ds-rt">{r.code}</span><b>{r.name}</b><span className="ds-col-n">{shops.length}</span></div>
                  <div className="ds-col-sub">{r.days.map(weekdayLabel).join(" · ") || "No days"} · {r.stops.length} stops</div>
                  <ul className="ds-col-list">
                    {shops.map((s, i) => <ShopCard key={s.customerId} s={s} i={i} landed={landed === s.customerId} tiers={options?.priceTiers} drag={cardDrag(s.customerId)} canEdit={can.route.edit} onMenu={(el) => shopMenu(s, el)} />)}
                    <li className="ds-dropzone">Drop here</li>
                  </ul>
                </div>
              );
            })}
            <div className={cn("ds-col ds-col-free", over === "free" && "over")} {...dragProps("free")} onDrop={(e) => onDrop(e, null)}>
              <div className="ds-col-head"><span className="ds-rt">—</span><b>Not on a route</b><span className="ds-col-n">{free.length}</span></div>
              <div className="ds-col-sub">Customers without a route{free.length >= 50 ? " · first 50" : ""}</div>
              <label className="ds-col-search search-field"><Search /><input type="search" value={freeQ} placeholder="Find a shop…" aria-label="Find a shop" onChange={(e) => setFreeQ(e.target.value)} /></label>
              <ul className="ds-col-list">
                {freeShops.map((s, i) => <ShopCard key={s.customerId} s={s} i={i} landed={landed === s.customerId} tiers={options?.priceTiers} drag={cardDrag(s.customerId)} canEdit={can.route.edit} onMenu={(el) => shopMenu(s, el)} />)}
                {!freeShops.length && <li className="ds-col-sub" style={{ listStyle: "none" }}>{freeQ ? "No match" : "Every customer is on a route"}</li>}
                <li className="ds-dropzone">Drop to take off its route</li>
              </ul>
            </div>
          </div>
        ) : <p className="muted small">Create a route first, then drag customers onto it.</p>}
      </div>

      {can.van.view && (
        <div className="panel flush ds-vans">
          <div className="panel-head"><div><h3>Vans</h3><p>Delivery vehicles, their capacity and the van warehouse that holds each one&apos;s stock.</p></div>
            {can.van.create && <button type="button" className="btn secondary sm" onClick={() => setVanModal({ van: null })}><Plus />Add van</button>}</div>
          {vans && vans.length ? (
            <div className="table-wrap"><table className="tbl ds-tbl">
              <thead><tr><th>Registration</th><th>Model</th><th className="num">Capacity</th><th>Van warehouse</th><th>Default driver</th><th>Routes</th><th>Status</th></tr></thead>
              <tbody>{vans.map((v, i) => (
                <tr key={v.id} className="ds-rowin" style={{ ["--i" as string]: i, cursor: "pointer" }} tabIndex={0} onClick={() => setVanModal({ van: v })} onKeyDown={(e) => e.key === "Enter" && setVanModal({ van: v })}>
                  <td><span className="ds-sku">{v.regNo}</span></td><td>{v.model}</td>
                  <td className="num">{v.capacityCtn.toLocaleString("en-US")} ctn<small className="muted"> · {v.capacityKg.toLocaleString("en-US")} kg</small></td>
                  <td>{v.warehouse ? `${v.warehouse.code} · ${v.warehouse.name}` : <span className="zero">Not linked</span>}</td>
                  <td>{v.defaultDriver?.name ?? <span className="zero">—</span>}</td>
                  <td>{v.routes.length ? v.routes.join(", ") : <span className="zero">—</span>}</td>
                  <td><span className={`badge ${VAN_TONE[v.status] ?? "neutral"}`}>{VAN_STATUS_LABEL[v.status] ?? v.status}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : (
            <EmptyState icon={<Truck />} title="No vans yet" description={vanWhs.length ? "Add a van and link it to one of your van warehouses." : "Vans keep their stock in a warehouse of type Van. Add the van, then use “Create van stock location” on it."}
              action={can.van.create ? <button type="button" className="btn primary" onClick={() => setVanModal({ van: null })}><Plus />Add van</button> : undefined} />
          )}
        </div>
      )}

      <div className="ds-people-head"><h3>Bookers &amp; salesmen</h3><span className="muted small">Month to date</span></div>
      {can.target.view ? <TargetsPeople can={targetCan} /> : <div className="panel"><EmptyState icon={<Users />} title="Targets are not shared with you" description="Booker and salesman cards need the targets permission." /></div>}
      <div className="ds-pp-bottom">
        {can.target.view ? <TargetsLeaderboard can={targetCan} /> : <div className="panel"><div className="panel-head"><div><h3>Leaderboard</h3><p>Ranked by achievement against target.</p></div><span className="icon-well yellow"><Trophy /></span></div>
          <EmptyState icon={<UserRound />} title="No targets yet" description="The leaderboard needs the targets permission." /></div>}
        {can.target.view && (
          <div className="panel flush"><div className="panel-head"><div><h3>Commission slabs</h3><p>{current ? `Paid on achieved sales, by target achievement band · ${periodLabel(current)}.` : "Paid on achieved sales, by target achievement band."}</p></div>
            {can.target.edit && slabs && <button type="button" className="btn secondary sm" onClick={() => setSlabOpen(true)}><Pencil />{slabs.periods.length ? "Edit bands" : "Set up bands"}</button>}</div>
            <div className="table-wrap"><table className="tbl ds-tbl" data-plain><thead><tr><th>Achievement</th><th className="num">Rate</th><th>Who&apos;s here</th><th className="num">Commission</th></tr></thead>
              <tbody>{current ? current.bands.map((b) => (
                <tr key={b.id} className="ds-dim"><td><b>{b.label}</b></td><td className="num">{b.ratePct.toFixed(1)}%</td><td><span className="zero">—</span></td><td className="num"><span className="zero">—</span></td></tr>
              )) : <tr><td colSpan={4} className="muted">{slabs?.periods.length ? "No bands in force today." : "No commission bands yet."}</td></tr>}</tbody></table></div>
          </div>
        )}
      </div>
      {can.target.view && <div style={{ marginTop: 16 }}><TargetsManager can={targetCan} /></div>}

      {sheet && <RouteSheet route={sheet.route} nextCode={nextCodeOf(routes)} options={options} can={can.route} onClose={() => setSheet(null)}
        onSaved={(r, created) => { setSheet(null); if (created) setSel(r.id); reload(); }} onDeleted={() => { setSheet(null); reload(); }} />}
      {vanModal && <VanModal van={vanModal.van} warehouses={vanWhs} options={options} can={can.van} onClose={() => setVanModal(null)} onSaved={() => { setVanModal(null); reload(); }} onChanged={reload} />}
      {areasOpen && <AreasModal areas={areas} can={can.route} onClose={() => setAreasOpen(false)} onChanged={reload} />}
      {slabOpen && slabs && <SlabEditor data={slabs} onClose={() => setSlabOpen(false)} onSaved={(r) => { setSlabs(r); setSlabOpen(false); reload(); }} />}
      {history && <Modal open onClose={() => setHistory(null)} title={`${history.title} · history`}><HistoryTab schema="Distribution" table={history.table} id={history.id} /></Modal>}
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} />}
    </>
  );
}

function ShopCard({ s, i, landed, tiers, drag, canEdit, onMenu }: {
  s: Shop; i: number; landed: boolean; tiers: RouteOptions["priceTiers"] | undefined; drag: Record<string, unknown>; canEdit: boolean; onMenu: (el: HTMLElement) => void;
}) {
  return (
    <li className={cn("ds-shopcard", landed && "ds-landed")} style={{ ["--i" as string]: i, ...(canEdit ? {} : { cursor: "default" }) }} {...drag}>
      <GripVertical className="grip" />
      <div><b>{s.name}</b><small>{[s.area ?? s.code, s.tier ? TIER_LABEL(tiers, s.tier) : "No route"].join(" · ")}</small></div>
      {canEdit && <button type="button" className="icon-btn-sm" aria-label={`Move ${s.name}`} onClick={(e) => onMenu(e.currentTarget)}><ArrowRightLeft /></button>}
    </li>
  );
}
