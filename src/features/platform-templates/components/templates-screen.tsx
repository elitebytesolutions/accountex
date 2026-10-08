"use client";

import { Building2, ChevronDown, ChevronRight, ChevronsDownUp, KeyRound, Lock, Pencil, Plus, Settings2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CoaTemplate, CoaTemplateDetail, LookupsResponse, RoleGrantMatrix, SeedLeaveType, SeedListKind, SeedSalaryComponent, SeedTaxCode } from "@/shared";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { labelOf } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getCoaTemplate, getRoleGrants, listCoaTemplates, listSeed } from "../api";
import { CoaImportModal } from "./coa-import-modal";
import { CoaTemplateModal } from "./coa-template-modal";
import { CoaTreeEditor } from "./coa-tree-editor";
import { RoleGrantsDrawer } from "./role-grants-drawer";
import { SeedModal } from "./seed-modal";
import { COA_STATUS, coaIcon, fmtWhen, pct } from "./templates-ui";

const LOOKUPS = ["GenderRestriction", "TemplateSalaryComponentKind", "TemplateSalaryComponentCalcMethod", "StatutoryCode", "TaxKind"];
type Tab = "tax" | "leave" | "salary" | "roles";
const KIND: Record<Exclude<Tab, "roles">, SeedListKind> = { tax: "tax-codes", leave: "leave-types", salary: "salary-components" };
type Seeds = { tax: SeedTaxCode[]; leave: SeedLeaveType[]; salary: SeedSalaryComponent[] };
type Load = { message: string; reference?: string } | null;
const fail = (e: unknown, m: string) => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: m });
const n = (v: number | null) => (v === null ? null : Number(v.toFixed(3)));

/**
 * Template admin/templates (30-entry-admin.html): COA template cards, the account-tree preview and the master seed
 * lists (tax codes, leave types, salary), plus the added "Default role grants" tab. Template-style additions: account
 * tree editor, CSV import with a validation report, Publish / Retire / Set default, seed-row modals.
 */
export function TemplatesScreen() {
  const lookups = useAdminLookups(LOOKUPS);
  const [templates, setTemplates] = useState<CoaTemplate[] | null>(null);
  const [error, setError] = useState<Load>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<CoaTemplateDetail | null>(null);
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [seeds, setSeeds] = useState<Seeds | null>(null);
  const [grants, setGrants] = useState<RoleGrantMatrix | null>(null);
  const [tab, setTab] = useState<Tab>("tax");
  const [version, setVersion] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [modal, setModal] = useState<
    | { kind: "template"; template: CoaTemplate | null }
    | { kind: "tree" }
    | { kind: "import" }
    | { kind: "seed"; list: SeedListKind; row: SeedTaxCode | SeedLeaveType | SeedSalaryComponent | null }
    | { kind: "grants"; systemKey: string }
    | null
  >(null);
  const reload = useCallback(() => setAttempt((x) => x + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCoaTemplates(), listSeed("tax-codes"), listSeed("leave-types"), listSeed("salary-components"), getRoleGrants()])
      .then(([t, tax, leave, salary, g]) => {
        if (cancelled) return;
        setTemplates(t);
        setSeeds({ tax, leave, salary });
        setGrants(g);
        setSel((s) => (s && t.some((x) => x.id === s) ? s : (t.find((x) => x.status === "DEFAULT") ?? t[0])?.id ?? null));
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(fail(e, "Could not load the templates")));
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    getCoaTemplate(sel)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setOpen((o) => o ?? new Set(d.accounts.filter((a) => a.level <= 2 || ["1110", "2140"].includes(a.code)).map((a) => a.code)));
      })
      .catch(() => !cancelled && setDetail(null));
    return () => { cancelled = true; };
  }, [sel, attempt]);

  const versions = useMemo(() => {
    const all = seeds ? [...seeds.tax, ...seeds.leave, ...seeds.salary].map((r) => r.seedVersion) : [];
    return [...new Set(all)].sort().reverse();
  }, [seeds]);
  const v = version && versions.includes(version) ? version : versions[0] ?? `v${new Date().getFullYear()}.1`;
  const selected = templates?.find((t) => t.id === sel) ?? null;

  if (error) return <><Head onImport={() => undefined} onNew={() => undefined} /><ErrorState {...error} onRetry={reload} /></>;
  if (!templates || !seeds || !grants) return <><Head onImport={() => undefined} onNew={() => undefined} /><Skeleton style={{ height: 180, borderRadius: 18 }} /><div className="mt" /><Skeleton style={{ height: 420, borderRadius: 18 }} /></>;

  return (
    <>
      <Head onImport={() => setModal({ kind: "import" })} onNew={() => setModal({ kind: "template", template: null })} />

      {templates.length === 0 ? (
        <EmptyState title="No chart-of-accounts templates" description="Create the first template tenants can apply." action={<button type="button" className="btn primary" onClick={() => setModal({ kind: "template", template: null })}><Plus />New template</button>} />
      ) : (
        <div className="card-grid mb">
          {templates.map((t) => {
            const [Icon, tone] = coaIcon(t.icon);
            const [label, badge] = COA_STATUS[t.status] ?? [t.status, "neutral"];
            return (
              <div key={t.id} className={cn("card", t.id === sel && "selected")} style={t.id === sel ? { borderColor: "var(--primary)" } : undefined}>
                <div className="row"><span className={cn("icon-well", tone)}><Icon /></span><div><b>{t.name}</b><small className="muted" style={{ display: "block" }}>{t.version} · {t.accountCount} accounts</small></div><span className="spacer" /><span className={`badge ${badge}`}>{label}</span></div>
                <p className="small muted mt">{t.description ?? "—"}</p>
                <div className="row small muted mt">
                  <Building2 size={16} />{t.tenantCount} tenant{t.tenantCount === 1 ? "" : "s"}<span className="spacer" />
                  <button type="button" className="btn ghost sm" onClick={() => setModal({ kind: "template", template: t })}><Settings2 />Manage</button>
                  <button type="button" className="btn ghost sm" onClick={() => setSel(t.id)}>Preview</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Preview — {selected?.name ?? "no template"}</h3><p>{selected ? `${selected.accountCount} accounts · ${selected.postableCount} postable · updated ${fmtWhen(selected.updatedAt)}` : "Top levels of the account tree"}</p></div>
            <div className="panel-actions">
              <button type="button" className="btn ghost sm" disabled={!detail} onClick={() => setOpen((o) => (o && o.size ? new Set() : new Set(detail?.accounts.filter((a) => a.level < 4).map((a) => a.code))))}><ChevronsDownUp />{open && open.size ? "Collapse" : "Expand"}</button>
              <button type="button" className="btn secondary sm" disabled={!detail || selected?.status === "RETIRED"} onClick={() => setModal({ kind: "tree" })}><Pencil />Edit</button>
            </div>
          </div>
          {!detail ? <Skeleton style={{ height: 320 }} /> : <Tree detail={detail} open={open ?? new Set()} toggle={(c) => setOpen((o) => { const x = new Set(o); if (x.has(c)) x.delete(c); else x.add(c); return x; })} />}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div><h3>Master seed lists</h3><p>Pakistan · {v}</p></div>
            {tab !== "roles" && (
              <div className="panel-actions">
                {versions.length > 1 && <select value={v} aria-label="Seed version" onChange={(e) => setVersion(e.target.value)}>{versions.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
                <button type="button" className="btn secondary sm" onClick={() => setModal({ kind: "seed", list: KIND[tab], row: null })}><Plus />Add</button>
              </div>
            )}
          </div>
          <Tabs<Tab> active={tab} onChange={setTab} items={[
            { key: "tax", label: "Tax codes" }, { key: "leave", label: "Leave types" }, { key: "salary", label: "Salary" }, { key: "roles", label: "Default role grants" },
          ]} />
          <div className="mt" />
          {tab === "roles" ? (
            <RoleList grants={grants} onOpen={(systemKey) => setModal({ kind: "grants", systemKey })} />
          ) : (
            <SeedList tab={tab} seeds={seeds} version={v} lookups={lookups} onOpen={(row) => setModal({ kind: "seed", list: KIND[tab], row })} />
          )}
        </div>
      </div>

      {modal?.kind === "template" && (
        <CoaTemplateModal template={modal.template} templates={templates} onClose={() => setModal(null)}
          onSaved={(id) => { setModal(null); if (id) setSel(id); reload(); }} />
      )}
      {modal?.kind === "tree" && detail && <CoaTreeEditor template={detail} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />}
      {modal?.kind === "import" && <CoaImportModal templates={templates} initialId={sel} onClose={() => setModal(null)} onImported={(id) => { setSel(id); reload(); }} />}
      {modal?.kind === "seed" && (
        <SeedModal kind={modal.list} row={modal.row} seedVersion={v} lookups={lookups} onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}
      {modal?.kind === "grants" && (() => {
        const role = grants.roles.find((r) => r.systemKey === modal.systemKey);
        return role ? (
          <RoleGrantsDrawer matrix={grants} role={role} onClose={() => setModal(null)}
            onSaved={(r) => setGrants((g) => (g ? { ...g, roles: g.roles.map((x) => (x.systemKey === r.systemKey ? r : x)) } : g))} />
        ) : null;
      })()}
    </>
  );
}

function Head({ onImport, onNew }: { onImport: () => void; onNew: () => void }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">Tenants / Templates</div>
        <h1>COA templates &amp; master seeds</h1>
        <p>Starter data for new tenants: chart of accounts, tax codes, leave types, salary components and default role permissions.</p>
      </div>
      <div className="head-actions">
        <button type="button" className="btn secondary" onClick={onImport}><Upload />Import from Excel</button>
        <button type="button" className="btn primary" onClick={onNew}><Plus />New template</button>
      </div>
    </div>
  );
}

/** Template `.tree` preview: class headers carry their normal balance; groups expand to their accounts. */
function Tree({ detail, open, toggle }: { detail: CoaTemplateDetail; open: Set<string>; toggle: (code: string) => void }) {
  const kids = new Map<string | null, CoaTemplateDetail["accounts"]>();
  for (const a of detail.accounts) kids.set(a.parentCode, [...(kids.get(a.parentCode) ?? []), a]);
  const rows: ReactNode[] = [];
  const walk = (parent: string | null) => {
    for (const a of kids.get(parent) ?? []) {
      const has = (kids.get(a.code) ?? []).length > 0;
      const isOpen = open.has(a.code);
      rows.push(
        <div key={a.code} className={`tree-row l${a.level}`} onClick={() => has && toggle(a.code)} role={has ? "button" : undefined} aria-expanded={has ? isOpen : undefined}>
          <span className="tw">{has && (isOpen ? <ChevronDown /> : <ChevronRight />)}</span><b>{a.code}</b> {a.name}
          {(a.level === 1 || a.defaultRole) && <><span className="spacer" /><span className={`badge ${a.level === 1 ? "neutral" : "info"}`}>{a.level === 1 ? (a.nature === "DR" ? "Debit" : "Credit") : a.defaultRole}</span></>}
        </div>,
      );
      if (has && isOpen) walk(a.code);
    }
  };
  walk(null);
  if (!rows.length) return <EmptyState title="No accounts yet" description="Use Edit to build the tree, or Import from Excel." />;
  return <div className="tree" style={{ maxHeight: 620, overflow: "auto" }}>{rows}</div>;
}

function SeedList({ tab, seeds, version, lookups, onOpen }: {
  tab: Exclude<Tab, "roles">;
  seeds: Seeds;
  version: string;
  lookups: LookupsResponse;
  onOpen: (row: SeedTaxCode | SeedLeaveType | SeedSalaryComponent) => void;
}) {
  const empty = <EmptyState title="Nothing in this seed version" description={`Add the first row for ${version}.`} />;
  if (tab === "tax") {
    const rows = seeds.tax.filter((r) => r.seedVersion === version);
    return rows.length ? (
      <div className="list">{rows.map((r) => (
        <button key={r.id} type="button" className="list-item" style={{ width: "100%", textAlign: "left", opacity: r.isActive ? 1 : 0.55 }} onClick={() => onOpen(r)}>
          <div><b>{r.code}</b><small>{r.description}{r.whtSection ? ` · ${r.whtSection}` : ""}{r.isActive ? "" : " · inactive"}</small></div><span className="spacer" />
          <b>{r.taxKind === "EXEMPT" && r.rate === null ? "—" : r.rateNote ?? pct(r.rate)}</b>
        </button>
      ))}</div>
    ) : empty;
  }
  if (tab === "leave") {
    const rows = seeds.leave.filter((r) => r.seedVersion === version);
    return rows.length ? (
      <div className="list">{rows.map((r) => {
        const note = [r.accrualPerMonth !== null && `Accrual ${n(r.accrualPerMonth)} / month`, r.carryForwardMax !== null && `carry fwd ${n(r.carryForwardMax)}`,
          r.medicalCertAfterDays !== null && `medical certificate after ${r.medicalCertAfterDays} days`, r.onceInService && "once in service",
          r.genderRestriction !== "ANY" && labelOf(lookups, "GenderRestriction", r.genderRestriction), !r.isPaid && "unpaid", r.ruleNote].filter(Boolean).join(" · ");
        return (
          <button key={r.id} type="button" className="list-item" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpen(r)}>
            <div><b>{r.name}</b><small>{note || (r.isPaid ? "Paid" : "Unpaid")}</small></div><span className="spacer" /><b>{n(r.daysPerYear)} d</b>
          </button>
        );
      })}</div>
    ) : empty;
  }
  const rows = seeds.salary.filter((r) => r.seedVersion === version);
  return rows.length ? (
    <div className="list">{rows.map((r) => {
      const note = [r.calcMethod === "PCT_OF_BASIC" ? `${n(r.pctOfBasic)}% of basic` : labelOf(lookups, "TemplateSalaryComponentCalcMethod", r.calcMethod),
        r.isTaxable ? "taxable" : "exempt", r.statutoryCode && labelOf(lookups, "StatutoryCode", r.statutoryCode), r.ruleNote].filter(Boolean).join(" · ");
      const earning = r.componentKind === "EARNING";
      return (
        <button key={r.id} type="button" className="list-item" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpen(r)}>
          <div><b>{r.name}</b><small>{note}</small></div><span className="spacer" /><span className={`badge ${earning ? "good" : "danger"}`}>{labelOf(lookups, "TemplateSalaryComponentKind", r.componentKind)}</span>
        </button>
      );
    })}</div>
  ) : empty;
}

/** Added tab: each system role with its default permission count; opens the role's permission matrix. */
function RoleList({ grants, onOpen }: { grants: RoleGrantMatrix; onOpen: (systemKey: string) => void }) {
  const total = grants.catalogue.reduce((k, m) => k + m.resources.reduce((j, r) => j + Object.keys(r.actions).length, 0), 0);
  return (
    <>
      <p className="small muted mb">Permissions each system role gets in a new company. Existing companies keep their own roles.</p>
      <div className="list">{grants.roles.map((r) => (
        <button key={r.systemKey} type="button" className="list-item" style={{ width: "100%", textAlign: "left" }} onClick={() => onOpen(r.systemKey)}>
          <div><b>{r.label}</b><small>{r.locked ? "Always every permission" : r.updatedAt ? `Edited ${fmtWhen(r.updatedAt)}` : "Catalogue defaults"}</small></div><span className="spacer" />
          {r.locked ? <span className="badge violet"><Lock />{total}</span> : <span className="badge neutral"><KeyRound />{r.permissions.length} / {total}</span>}
        </button>
      ))}</div>
    </>
  );
}
