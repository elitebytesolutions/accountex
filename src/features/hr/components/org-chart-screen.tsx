"use client";

import { Briefcase, Building2, ChevronsDownUp, Download, GitBranch, Layers, Maximize2, Network, Search, Users, UserX, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OrgChart, OrgNode } from "@/shared";
import { cn } from "@/components/ui/cn";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { orgChart } from "../api";

type View = "people" | "departments" | "positions";
const initials = (s: string) => s.split(/[\s&/-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const matches = (n: OrgNode, q: string): boolean => n.title.toLowerCase().includes(q) || n.children.some((c) => matches(c, q));
const count = (roots: OrgNode[] | undefined, kind: OrgNode["kind"]) => { let n = 0; const walk = (x: OrgNode) => { if (x.kind === kind) n++; x.children.forEach(walk); }; roots?.forEach(walk); return n; };

/**
 * Template app/hr/org (50-hr-core.html): "People" is employees by reporting manager, "Departments" the department tree,
 * "Positions" nests each department's designations (filled / approved) by reporting line.
 */
export function OrgChartScreen({ companyName }: { companyName: string }) {
  const [view, setView] = useState<View>("people");
  const [chart, setChart] = useState<OrgChart | null>(null);
  const [loadedView, setLoadedView] = useState<View | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    orgChart(view).then((c) => { if (!cancelled) { setChart(c); setLoadedView(view); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the chart" }));
    return () => { cancelled = true; };
  }, [view, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  // A wide tree opens centred on its root rather than scrolled to the left edge.
  useEffect(() => {
    const p = panel.current;
    if (p && chart && loadedView === view) p.scrollLeft = (p.scrollWidth - p.clientWidth) / 2;
  }, [chart, loadedView, view, zoom]);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const qq = q.trim().toLowerCase();
  const people = count(chart?.roots, "EMPLOYEE");
  const deptCount = count(chart?.roots, "DEPARTMENT");
  const vacant = chart?.vacant ?? 0;
  const node = (n: OrgNode, depth: number): React.ReactNode => {
    if (qq && !matches(n, qq)) return null;
    const hit = qq && n.title.toLowerCase().includes(qq);
    const kids = collapsed && depth >= 1 ? [] : n.children;
    return (
      <div key={n.id} className="org-node">
        <div className={cn("org-card", hit && "on")} style={hit ? { outline: "2px solid var(--primary)", outlineOffset: 2 } : undefined}>
          <span className={cn("avatar", depth > 1 && "sm")}>{n.kind === "DESIGNATION" ? <Briefcase /> : initials(n.title)}</span>
          <b>{n.kind === "EMPLOYEE" ? <Link href={`/hr/employees/${n.id}`}>{n.title}</Link> : n.title}</b><small>{n.subtitle}</small>
          {n.badge && <span className={cn("badge", n.kind === "DEPARTMENT" ? (depth === 0 ? "neutral" : "info") : n.kind === "EMPLOYEE" ? "neutral" : n.filled >= n.positions ? "good" : "warn")}>{n.badge}</span>}
        </div>
        {kids.length > 0 && <div className="org-children">{kids.map((c) => node(c, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <>
      <PageHead eyebrow="HR / Organisation" title="Organisation Chart"
        description={`Reporting lines for ${companyName} · ${view === "people" ? `${people} ${people === 1 ? "person" : "people"}` : `${deptCount} department${deptCount === 1 ? "" : "s"}`} · ${vacant} open position${vacant === 1 ? "" : "s"}.`}
        actions={<>
          <button className="btn secondary" type="button" onClick={() => window.print()}><Download />Export PDF</button>
          <Link className="btn primary" href="/hr/departments"><Building2 />Departments</Link>
        </>} />
      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder={view === "people" ? "Find a person…" : view === "departments" ? "Find a department…" : "Find a department or position…"} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div className="chips">
          <button type="button" className={cn(view === "people" && "active")} onClick={() => setView("people")}>People</button>
          <button type="button" className={cn(view === "departments" && "active")} onClick={() => setView("departments")}>Departments</button>
          <button type="button" className={cn(view === "positions" && "active")} onClick={() => setView("positions")}>Positions</button>
        </div>
        <span className="spacer" />
        <button className="btn secondary sm icon" type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}><ZoomOut /></button>
        <span className="small muted">{Math.round(zoom * 100)}%</span>
        <button className="btn secondary sm icon" type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}><ZoomIn /></button>
        <button className="btn secondary sm icon" type="button" title="Fit to screen" aria-label="Full screen" onClick={() => void panel.current?.requestFullscreen?.()}><Maximize2 /></button>
        <button className="btn secondary sm" type="button" onClick={() => setCollapsed((c) => !c)}><ChevronsDownUp />{collapsed ? "Expand all" : "Collapse all"}</button>
      </div>

      <div className="panel" style={{ overflowX: "auto" }} ref={panel}>
        {!chart || loadedView !== view ? <Skeleton style={{ height: 260 }} /> : chart.roots.length ? (
          <div className="org" style={{ zoom }}>
            {chart.roots.length === 1 ? node(chart.roots[0]!, 0) : (
              <div className="org-node">
                <div className="org-card"><span className="avatar">{initials(companyName)}</span><b>{companyName}</b><small>Company</small><span className="badge neutral">{view === "people" ? `${people} ${people === 1 ? "person" : "people"}` : `${deptCount} departments`}</span></div>
                <div className="org-children">{chart.roots.map((r) => node(r, 1))}</div>
              </div>
            )}
          </div>
        ) : view === "people" ? <EmptyState icon={<Users />} title="No employees yet" description={<>Add employees on <Link href="/hr/employees">Employees</Link>; they appear here under their reporting manager.</>} />
          : <EmptyState icon={<Network />} title="No departments yet" description={<>Add departments and designations on <Link href="/hr/departments">Departments &amp; Designations</Link> to build the chart.</>} />}
      </div>

      <div className="grid-4 mt">
        <div className="panel"><div className="row"><span className="icon-well"><Layers /></span><div><b>{chart?.maxDepth ?? 0} level{chart?.maxDepth === 1 ? "" : "s"}</b><small className="muted" style={{ display: "block" }}>Max reporting depth</small></div></div></div>
        <div className="panel"><div className="row"><span className="icon-well"><Users /></span><div><b>1 : {chart?.avgSpan ?? 0}</b><small className="muted" style={{ display: "block" }}>Avg. span of control</small></div></div></div>
        <div className="panel"><div className="row"><span className="icon-well"><UserX /></span><div><b>{vacant} vacant</b><small className="muted" style={{ display: "block" }}>Open positions in chart</small></div></div></div>
        <div className="panel"><div className="row"><span className="icon-well"><GitBranch /></span><div><b>{chart?.branches.count ?? 0} branch{chart?.branches.count === 1 ? "" : "es"}</b><small className="muted" style={{ display: "block" }}>{chart?.branches.codes.join(" · ") || "—"}</small></div></div></div>
      </div>
    </>
  );
}
