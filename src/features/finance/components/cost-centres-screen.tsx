"use client";

import {
  Building2, CalendarRange, Check, ChevronDown, CircleDot, Ellipsis, FolderKanban, GitFork, History, Pencil, Plus, Search, Split, Trash2, Wallet, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Account, AllocationRule, CostCentre, Project } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { IconWell, PageHead, Panel } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { listBranchOptions, type BranchOption } from "@/features/treasury/api";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import {
  createAllocationRule, createCostCentre, createProject, deleteAllocationRule, deleteCostCentre, deleteProject, listAccounts, listAllocationRules,
  listCostCentres, listProjects, setCostCentreStatus, updateAllocationRule, updateCostCentre, updateProject,
} from "../api";
import { dateLabel, Money } from "./finance-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Sel = { kind: "cc" | "proj"; id: string } | null;
const LOOKUPS = ["CentreType", "ProjectStatus", "ProjectColour", "CostAllocationRuleBasis"];
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? (e.code === "DB_UNIQUE_VIOLATION" ? "That code is already used" : e.message) : fallback);

/** Template app/accounting/cost-centres (4A-company-plus.html + 9A-company-plus.js §7): structure tree, detail, allocation rules. */
export function CostCentresScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [centres, setCentres] = useState<CostCentre[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<Sel>(null);
  const [q, setQ] = useState("");
  const [shut, setShut] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ kind: "cc" | "proj"; edit: CostCentre | Project | null } | null>(null);
  const [ruleForm, setRuleForm] = useState<{ edit: AllocationRule | null } | null>(null);
  const [removing, setRemoving] = useState<{ label: string; run: () => Promise<void> } | null>(null);
  const [history, setHistory] = useState<{ table: string; id: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCostCentres(), listProjects(), listAllocationRules(), listAccounts(), listBranchOptions()])
      .then(([c, p, r, a, b]) => {
        if (cancelled) return;
        setCentres(c);
        setProjects(p);
        setRules(r);
        setAccounts(a);
        setBranches(b);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load cost centres" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const all = useMemo(() => centres ?? [], [centres]);
  const roots = all.filter((c) => !c.parentId);
  const kidsOf = (id: string) => all.filter((c) => c.parentId === id);
  const centre = sel?.kind === "cc" ? all.find((c) => c.id === sel.id) : undefined;
  const project = sel?.kind === "proj" ? projects.find((p) => p.id === sel.id) : undefined;
  if (centres && !sel && (all[0] || projects[0])) setSel(all[0] ? { kind: "cc", id: (roots[0] ?? all[0]).id } : { kind: "proj", id: projects[0]!.id });

  const needle = q.trim().toLowerCase();
  const hit = (n: { name: string; code: string }) => !needle || n.name.toLowerCase().includes(needle) || n.code.toLowerCase().includes(needle);
  const centreName = (id: string) => all.find((c) => c.id === id)?.name ?? "—";
  /** A centre without its own budget shows the total of its sub-centres. */
  const budgetOf = (c: CostCentre) => c.annualBudget ?? kidsOf(c.id).reduce((s, k) => s + (k.annualBudget ?? 0), 0);
  const leaves = all.filter((c) => !kidsOf(c.id).length || c.parentId);
  const budget = all.filter((c) => !kidsOf(c.id).length).reduce((s, c) => s + (c.annualBudget ?? 0), 0);

  const run = async (label: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast(label, { tone: "good" });
      after?.();
      reload();
    } catch (e) {
      toast(errMsg(e, "Could not save"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  return (
    <div className="cp-screen">
      <PageHead
        eyebrow={<><FolderKanban />Accounting / Cost Centres &amp; Projects</>}
        title="Cost Centres & Projects"
        description="Track spend by branch and department, run project P&Ls, and let allocation rules split shared costs automatically."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setForm({ kind: "cc", edit: null })}>New centre / project</Button>}
      />

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Cost centres</span><span className="icon-well"><GitFork /></span></div><strong>{centres ? all.filter((c) => c.parentId).length : "…"}</strong><small>Across {roots.length} top-level centres</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Active projects</span><span className="icon-well"><FolderKanban /></span></div><strong>{projects.filter((p) => p.status === "IN_PROGRESS" || p.status === "PLANNING").length}</strong><small>{rs(projects.reduce((s, p) => s + p.budgetAmount, 0))} budgeted</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Annual opex budget</span><span className="icon-well"><Wallet /></span></div><strong>{rs(budget)}</strong><small>Spend appears once vouchers are tagged</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Allocation rules</span><span className="icon-well"><Split /></span></div><strong>{rules.filter((r) => r.status === "ACTIVE").length}</strong><small>{rules.length} defined</small></div>
      </div>

      <div className="split-l cp-cc-split">
        <div className="panel cp-cc-tree-p">
          <div className="panel-head"><div><h3>Structure</h3><p>Branches, departments and projects</p></div></div>
          <label className="search-field cp-sf"><Search /><input placeholder="Find centre or project…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="cp-tree">
            {!centres && <Skeleton style={{ height: 160 }} />}
            {centres && (
              <>
                <div className="cp-tr-g"><GitFork />Branches &amp; departments</div>
                {roots.map((r) => {
                  const ks = kidsOf(r.id).filter(hit);
                  if (!hit(r) && !ks.length) return null;
                  return (
                    <div key={r.id}>
                      <TreeRow n={r} lvl={0} on={sel?.id === r.id} shut={shut.has(r.id)} hasKids={kidsOf(r.id).length > 0} inactive={r.status !== "ACTIVE"}
                        icon={r.centreType === "BRANCH" ? <Building2 /> : <CircleDot />}
                        onToggle={() => setShut((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                        onPick={() => setSel({ kind: "cc", id: r.id })} />
                      {!shut.has(r.id) && (hit(r) ? kidsOf(r.id) : ks).map((k) => (
                        <TreeRow key={k.id} n={k} lvl={1} on={sel?.id === k.id} inactive={k.status !== "ACTIVE"} icon={<CircleDot />} onPick={() => setSel({ kind: "cc", id: k.id })} />
                      ))}
                    </div>
                  );
                })}
                {!all.length && <p className="muted small">No cost centres yet.</p>}
                {projects.some(hit) && <div className="cp-tr-g"><FolderKanban />Projects</div>}
                {projects.filter(hit).map((p) => (
                  <TreeRow key={p.id} n={p} lvl={0} on={sel?.id === p.id} colour={p.colour} icon={<FolderKanban />} onPick={() => setSel({ kind: "proj", id: p.id })} />
                ))}
              </>
            )}
          </div>
          <div className="cp-tr-lg"><span><i className="good" />On track</span><span><i className="warn" />Watch</span><span><i className="danger" />Over</span></div>
        </div>

        <div>
          {!centres && <div className="panel"><Skeleton style={{ height: 220 }} /></div>}
          {centres && !centre && !project && (
            <Panel><EmptyState icon={<GitFork />} title="No cost centres yet" description="Create branches and departments to tag spend for reporting." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setForm({ kind: "cc", edit: null })}>New cost centre</Button>} /></Panel>
          )}
          {(centre || project) && (
            <>
              <div className="panel cp-cc-head">
                <div className="cp-cc-ht">
                  <span className={cn("icon-tile", project ? project.colour : "green")}>{project ? <FolderKanban /> : centre!.centreType === "BRANCH" ? <Building2 /> : <CircleDot />}</span>
                  <div>
                    <small>
                      {project ? `${project.code} · Project` : `${centre!.code}${centre!.parentId ? ` · ${centreName(centre!.parentId)}` : ""} · ${labelOf(lookups, "CentreType", centre!.centreType)}`}
                      {centre?.branchId && ` · ${branches.find((b) => b.id === centre.branchId)?.name ?? ""}`}
                    </small>
                    <h2>{(project ?? centre)!.name}</h2>
                    <div className="row cp-wrap-row">
                      {project ? (
                        <>
                          <Badge tone={project.status === "PLANNING" ? "info" : project.status === "IN_PROGRESS" ? "good" : "neutral"} dot>{labelOf(lookups, "ProjectStatus", project.status)}</Badge>
                          {(project.startDate || project.endDate) && <span className="pill"><CalendarRange />{dateLabel(project.startDate)} → {dateLabel(project.endDate)}</span>}
                        </>
                      ) : <Badge tone={centre!.status === "ACTIVE" ? "good" : "neutral"} dot>{centre!.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>}
                      {(project ?? centre)!.tags.map((t) => <span key={t} className="pill cp-tag">#{t}</span>)}
                    </div>
                  </div>
                  <span className="spacer" />
                  {can.edit && <Button size="sm" icon={<Pencil />} onClick={() => setForm({ kind: project ? "proj" : "cc", edit: (project ?? centre)! })}>Edit</Button>}
                  <button type="button" className="icon-btn-sm" aria-label="More actions" onClick={(e) => {
                    const n = (project ?? centre)!;
                    setMenu({
                      anchor: e.currentTarget,
                      items: [
                        ...(can.edit && centre ? [centre.status === "ACTIVE"
                          ? { label: "Deactivate", icon: <X />, onClick: () => run(`${centre.name} deactivated`, () => setCostCentreStatus(centre.id, "deactivate", centre.rowVersion)) }
                          : { label: "Activate", icon: <Check />, onClick: () => run(`${centre.name} activated`, () => setCostCentreStatus(centre.id, "activate", centre.rowVersion)) }] : []),
                        { label: "History", icon: <History />, onClick: () => setHistory({ table: project ? "Projects" : "CostCentres", id: n.id, title: n.name }) },
                        ...(can.remove ? [{ sep: true as const }, {
                          label: "Delete", icon: <Trash2 />, danger: true,
                          onClick: () => setRemoving({
                            label: n.name,
                            run: () => run(`${n.name} deleted`, () => (project ? deleteProject(n.id, n.rowVersion) : deleteCostCentre(n.id, n.rowVersion)), () => { setRemoving(null); setSel(null); }),
                          }),
                        }] : []),
                      ],
                    });
                  }}><Ellipsis /></button>
                </div>
                <div className="cp-cc-kpis">
                  <div><small>{project ? "Total budget" : "Annual budget"}</small><b><Money value={project ? project.budgetAmount : budgetOf(centre!)} dec={0} /></b></div>
                  <div><small>{project ? "Expected revenue" : "Actual to date"}</small><b><Money value={project ? project.expectedRevenue : 0} dec={0} /></b></div>
                  <div><small>{project ? "Actual to date" : "Remaining"}</small><b className="cp-okc"><Money value={project ? 0 : budgetOf(centre!)} dec={0} /></b></div>
                  <div className="cp-cc-ring"><Ring pct={0} /><span><b>0%</b><small>used</small></span></div>
                </div>
              </div>
              <Panel title={project ? "Project P&L" : "Budget vs actual"} description={project ? "Revenue, cost and margin to date" : "Year to date"}>
                <EmptyState icon={<Wallet />} title="No spend tagged yet" description={`Vouchers, bills and payroll tagged to ${project ? "this project" : "this cost centre"} appear here once posting starts (Phase 16).`} />
              </Panel>
            </>
          )}
        </div>
      </div>

      <Panel title="Allocation rules" description="Shared costs are split automatically when the voucher is posted" actions={can.create && <Button size="sm" icon={<Plus />} disabled={!leaves.length} onClick={() => setRuleForm({ edit: null })}>New rule</Button>}>
        <div className="cp-ars">
          {!rules.length && <p className="muted small">No allocation rules yet. A rule splits one expense account across cost centres by percentage.</p>}
          {rules.map((r, i) => (
            <div key={r.id} className="cp-ar" style={{ ["--i" as string]: i, cursor: can.edit ? "pointer" : undefined, opacity: r.status === "ACTIVE" ? 1 : 0.6 }} onClick={() => can.edit && setRuleForm({ edit: r })}>
              <div className="cp-ar-h">
                <IconWell><Split /></IconWell>
                <div><b>{r.name}</b><small>{r.accountCode} {r.accountName} · by {labelOf(lookups, "CostAllocationRuleBasis", r.basis)}</small></div>
                <span className="spacer" />
                {r.status !== "ACTIVE" && <Badge tone="neutral" dot>Inactive</Badge>}
                {r.tags.map((t) => <span key={t} className="pill cp-tag">#{t}</span>)}
              </div>
              <div className="cp-ar-bar">{r.splits.map((s, j) => <i key={s.costCentreId} style={{ flex: s.percent, background: `var(--cp-s${j % 6})` }} title={`${centreName(s.costCentreId)} ${s.percent}%`}><span>{s.percent}%</span></i>)}</div>
              <div className="cp-ar-lg">{r.splits.map((s, j) => <span key={s.costCentreId}><i style={{ background: `var(--cp-s${j % 6})` }} />{centreName(s.costCentreId)}</span>)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <CentreForm form={form} centres={all} projects={projects} branches={branches} lookups={lookups} busy={busy} onClose={() => setForm(null)}
        onSave={(label, fn) => run(label, fn, () => setForm(null))} />
      <RuleForm form={ruleForm} centres={all} accounts={accounts} lookups={lookups} busy={busy} canRemove={can.remove} onClose={() => setRuleForm(null)}
        onSave={(label, fn) => run(label, fn, () => setRuleForm(null))}
        onRemove={(r) => setRemoving({ label: r.name, run: () => run(`${r.name} deleted`, () => deleteAllocationRule(r.id, r.rowVersion), () => { setRemoving(null); setRuleForm(null); }) })} />

      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.label ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={() => removing?.run()}>
        It is removed from lists. Items still used by sub-centres, rules or postings can’t be deleted; deactivate them instead.
      </ConfirmDialog>
      <Drawer open={!!history} onClose={() => setHistory(null)} title={history ? `${history.title} history` : "History"} subtitle="Every change, with who made it">
        {history && <HistoryTab schema="Accounting" table={history.table} id={history.id} />}
      </Drawer>
    </div>
  );
}

function Ring({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 52;
  return (
    <svg className="cp-ring good" viewBox="0 0 120 120" aria-hidden>
      <circle className="trk" cx="60" cy="60" r="52" />
      <circle className="val" cx="60" cy="60" r="52" strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)} />
    </svg>
  );
}

function TreeRow({ n, lvl, on, shut, hasKids, inactive, icon, colour, onToggle, onPick }: {
  n: { code: string; name: string }; lvl: 0 | 1; on: boolean; shut?: boolean; hasKids?: boolean; inactive?: boolean; icon: ReactNode; colour?: string;
  onToggle?: () => void; onPick: () => void;
}) {
  return (
    <button type="button" className={cn("cp-tr", `lvl${lvl}`, on && "on", shut && "shut")} style={inactive ? { opacity: 0.55 } : undefined} onClick={(e) => ((e.target as HTMLElement).closest(".cp-tr-tog") ? onToggle?.() : onPick())}>
      {hasKids ? <span className="cp-tr-tog"><ChevronDown /></span> : <span className="cp-tr-sp" />}
      <span className={cn("cp-tr-ic", colour)}>{icon}</span>
      <span className="cp-tr-n"><b>{n.name}</b><small>{n.code}</small></span>
      <span className="cp-tr-m" title="0% of annual budget used"><i className="good" style={{ width: "0%" }} /></span>
    </button>
  );
}

/** Template cp-tags: chips plus an input; Enter adds a tag. */
function Tags({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && text.trim()) {
      e.preventDefault();
      const t = text.trim().replace(/^#/, "").toLowerCase();
      if (!value.includes(t)) onChange([...value, t]);
      setText("");
    } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="cp-tags">
      {value.map((t) => <span key={t} className="pill cp-tag" onClick={() => onChange(value.filter((x) => x !== t))} title="Remove" style={{ cursor: "pointer" }}>#{t}</span>)}
      <input placeholder="Type a tag and press Enter" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={add} />
    </div>
  );
}

function nextCode(prefix: string, taken: string[]) {
  for (let n = 1; n < 1000; n++) {
    const c = `${prefix}-${String(n).padStart(2, "0")}`;
    if (!taken.includes(c)) return c;
  }
  return "";
}

type CentreState = {
  kind: "cc" | "proj"; name: string; code: string; parentId: string; branchId: string; centreType: string; annualBudget: string; tags: string[];
  status: string; colour: string; budgetAmount: string; expectedRevenue: string; startDate: string; endDate: string;
};

function CentreForm({ form, centres, projects, branches, lookups, busy, onClose, onSave }: {
  form: { kind: "cc" | "proj"; edit: CostCentre | Project | null } | null;
  centres: CostCentre[]; projects: Project[]; branches: BranchOption[]; lookups: ReturnType<typeof useLookups>; busy: boolean;
  onClose: () => void; onSave: (label: string, fn: () => Promise<unknown>) => void;
}) {
  const [s, setS] = useState<CentreState | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [prev, setPrev] = useState(form);
  if (form !== prev) {
    setPrev(form);
    setErrs({});
    if (form) {
      const c = form.kind === "cc" ? (form.edit as CostCentre | null) : null, p = form.kind === "proj" ? (form.edit as Project | null) : null;
      setS({
        kind: form.kind, name: form.edit?.name ?? "", code: form.edit?.code ?? "", parentId: c?.parentId ?? "", branchId: c?.branchId ?? "",
        centreType: c?.centreType ?? "DEPARTMENT", annualBudget: c?.annualBudget != null ? String(c.annualBudget) : "", tags: form.edit?.tags ?? [],
        status: p?.status ?? "PLANNING", colour: p?.colour ?? "blue", budgetAmount: p ? String(p.budgetAmount) : "", expectedRevenue: p ? String(p.expectedRevenue) : "",
        startDate: p?.startDate ?? "", endDate: p?.endDate ?? "",
      });
    }
  }
  const set = <K extends keyof CentreState>(k: K, v: CentreState[K]) => setS((x) => (x ? { ...x, [k]: v } : x));
  const edit = form?.edit ?? null;
  const save = () => {
    if (!s) return;
    if (s.name.trim().length < 2) return setErrs({ name: "Name is required" });
    const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/,/g, "")));
    if (s.kind === "cc") {
      const body = {
        name: s.name, code: s.code || nextCode(s.centreType === "BRANCH" ? "BR" : "CC", centres.map((c) => c.code)), parentId: s.parentId || null,
        branchId: s.branchId || null, centreType: s.centreType, annualBudget: num(s.annualBudget), tags: s.tags,
      };
      onSave(edit ? `${s.name} updated` : `${s.name} created`, () => (edit ? updateCostCentre(edit.id, { ...body, rowVersion: edit.rowVersion }) : createCostCentre(body)));
    } else {
      const body = {
        name: s.name, code: s.code || nextCode("PRJ", projects.map((p) => p.code)), status: s.status, colour: s.colour, budgetAmount: num(s.budgetAmount) ?? 0,
        expectedRevenue: num(s.expectedRevenue) ?? 0, startDate: s.startDate || null, endDate: s.endDate || null, tags: s.tags,
      };
      onSave(edit ? `${s.name} updated` : `${s.name} created`, () => (edit ? updateProject(edit.id, { ...body, rowVersion: edit.rowVersion }) : createProject(body)));
    }
  };
  const ccParents = centres.filter((c) => !c.parentId && c.id !== edit?.id);
  return (
    <Modal open={!!form} onClose={onClose} wide title={edit ? `Edit ${edit.name}` : "New cost centre / project"} subtitle="Tag vouchers, bills and payroll to it for reporting"
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={save} disabled={busy}><Check />{busy ? "Saving…" : "Save"}</button></>}>
      {s && (
        <>
          {!edit && (
            <div className="seg">
              <button type="button" className={cn(s.kind === "cc" && "active")} onClick={() => set("kind", "cc")}><GitFork />Cost centre</button>
              <button type="button" className={cn(s.kind === "proj" && "active")} onClick={() => set("kind", "proj")}><FolderKanban />Project</button>
            </div>
          )}
          <div className="cp-mt" style={{ marginTop: 16 }}>
            <FormGrid>
              <Field label="Name" required error={errs.name}><input value={s.name} autoFocus placeholder={s.kind === "cc" ? "e.g. Multan Sales" : "e.g. Warehouse Fit-out"} onChange={(e) => set("name", e.target.value)} /></Field>
              <Field label="Code" hint={edit ? "Codes can be changed; history keeps the old one" : s.kind === "cc" ? "Like ADM-01 · leave blank for the next free code" : "Like PRJ-01 · leave blank for the next free code"}>
                <input value={s.code} placeholder="Auto" onChange={(e) => set("code", e.target.value.toUpperCase())} />
              </Field>
              {s.kind === "cc" ? (
                <>
                  <Field label="Parent"><select value={s.parentId} onChange={(e) => set("parentId", e.target.value)}><option value="">(none: top level)</option>{ccParents.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                  <Field label="Type"><select value={s.centreType} onChange={(e) => set("centreType", e.target.value)}>{(lookups.CentreType ?? [{ code: "DEPARTMENT", label: "Department", tone: "neutral" }]).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
                  <Field label="Branch"><select value={s.branchId} onChange={(e) => set("branchId", e.target.value)}><option value="">All branches</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
                  <Field label="Annual budget (Rs)"><input inputMode="decimal" value={s.annualBudget} placeholder="0" onChange={(e) => set("annualBudget", e.target.value)} /></Field>
                </>
              ) : (
                <>
                  <Field label="Status"><select value={s.status} onChange={(e) => set("status", e.target.value)}>{(lookups.ProjectStatus ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
                  <Field label="Colour"><select value={s.colour} onChange={(e) => set("colour", e.target.value)}>{(lookups.ProjectColour ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
                  <Field label="Budget (Rs)"><input inputMode="decimal" value={s.budgetAmount} placeholder="0" onChange={(e) => set("budgetAmount", e.target.value)} /></Field>
                  <Field label="Expected revenue (Rs)"><input inputMode="decimal" value={s.expectedRevenue} placeholder="0" onChange={(e) => set("expectedRevenue", e.target.value)} /></Field>
                  <Field label="Start date"><input type="date" value={s.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
                  <Field label="End date"><input type="date" value={s.endDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
                </>
              )}
              <Field label="Tags" full><Tags value={s.tags} onChange={(v) => set("tags", v)} /></Field>
            </FormGrid>
          </div>
        </>
      )}
    </Modal>
  );
}

type RuleState = { name: string; accountId: string; basis: string; status: string; tags: string[]; splits: { costCentreId: string; percent: string }[] };

function RuleForm({ form, centres, accounts, lookups, busy, canRemove, onClose, onSave, onRemove }: {
  form: { edit: AllocationRule | null } | null; centres: CostCentre[]; accounts: Account[]; lookups: ReturnType<typeof useLookups>; busy: boolean; canRemove: boolean;
  onClose: () => void; onSave: (label: string, fn: () => Promise<unknown>) => void; onRemove: (r: AllocationRule) => void;
}) {
  const [s, setS] = useState<RuleState | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prev, setPrev] = useState(form);
  if (form !== prev) {
    setPrev(form);
    setErr(null);
    if (form) {
      const r = form.edit;
      setS(r ? { name: r.name, accountId: r.accountId, basis: r.basis, status: r.status, tags: r.tags, splits: r.splits.map((x) => ({ costCentreId: x.costCentreId, percent: String(x.percent) })) }
        : { name: "", accountId: "", basis: "HEADCOUNT", status: "ACTIVE", tags: [], splits: [{ costCentreId: "", percent: "100" }] });
    }
  }
  const options = accounts.filter((a) => a.kind === "POSTABLE" && a.status === "ACTIVE" && a.accountClass === 5);
  const active = centres.filter((c) => c.status === "ACTIVE");
  const total = s ? s.splits.reduce((n, x) => n + (Number(x.percent) || 0), 0) : 0;
  const save = () => {
    if (!s) return;
    if (s.name.trim().length < 2) return setErr("Name the rule");
    if (!s.accountId) return setErr("Choose the account to split");
    if (s.splits.some((x) => !x.costCentreId)) return setErr("Choose a cost centre on every line");
    if (Math.abs(total - 100) > 0.0001) return setErr(`Splits must total 100% (now ${total}%)`);
    const body = { name: s.name, accountId: s.accountId, basis: s.basis, status: s.status as "ACTIVE" | "INACTIVE", tags: s.tags, splits: s.splits.map((x) => ({ costCentreId: x.costCentreId, percent: Number(x.percent) })) };
    const edit = form?.edit;
    onSave(edit ? `${s.name} updated` : `Allocation rule ${s.name} added`, () => (edit ? updateAllocationRule(edit.id, { ...body, rowVersion: edit.rowVersion }) : createAllocationRule(body)));
  };
  const setSplit = (i: number, k: "costCentreId" | "percent", v: string) => setS((x) => (x ? { ...x, splits: x.splits.map((sp, j) => (j === i ? { ...sp, [k]: v } : sp)) } : x));
  return (
    <Modal open={!!form} onClose={onClose} wide title={form?.edit ? `Edit ${form.edit.name}` : "New allocation rule"} subtitle="Split one expense account across cost centres by percentage"
      foot={
        <>
          {form?.edit && canRemove && <button type="button" className="btn ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={() => onRemove(form.edit!)}><Trash2 />Delete</button>}
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy}><Check />{busy ? "Saving…" : "Save rule"}</button>
        </>
      }>
      {s && (
        <FormGrid>
          <Field label="Rule name" required><input value={s.name} autoFocus placeholder="e.g. Office rent" onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
          <Field label="Expense account" required>
            <select value={s.accountId} onChange={(e) => setS({ ...s, accountId: e.target.value })}>
              <option value="">Choose…</option>
              {options.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </Field>
          <Field label="Basis"><select value={s.basis} onChange={(e) => setS({ ...s, basis: e.target.value })}>{(lookups.CostAllocationRuleBasis ?? []).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
          <Field label="Status"><select value={s.status} onChange={(e) => setS({ ...s, status: e.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></Field>
          <div className="full">
            <span className="small" style={{ fontWeight: 700, color: "var(--ink-2)" }}>Split · <b style={{ color: Math.abs(total - 100) < 0.0001 ? "var(--good)" : "var(--danger)" }}>{total}%</b> of 100%</span>
            {s.splits.map((sp, i) => (
              <div key={i} className="row" style={{ gap: 8, marginTop: 8 }}>
                <select style={{ flex: 1 }} value={sp.costCentreId} onChange={(e) => setSplit(i, "costCentreId", e.target.value)} aria-label="Cost centre">
                  <option value="">Cost centre…</option>
                  {active.map((c) => <option key={c.id} value={c.id} disabled={s.splits.some((x, j) => j !== i && x.costCentreId === c.id)}>{c.code} · {c.name}</option>)}
                </select>
                <input style={{ width: 100 }} inputMode="decimal" value={sp.percent} onChange={(e) => setSplit(i, "percent", e.target.value)} aria-label="Percent" />
                <span className="muted">%</span>
                <button type="button" className="btn ghost sm" aria-label="Remove line" disabled={s.splits.length === 1} onClick={() => setS({ ...s, splits: s.splits.filter((_, j) => j !== i) })}><X /></button>
              </div>
            ))}
            <button type="button" className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setS({ ...s, splits: [...s.splits, { costCentreId: "", percent: String(Math.max(0, 100 - total)) }] })}><Plus />Add cost centre</button>
          </div>
          <Field label="Tags" full><Tags value={s.tags} onChange={(v) => setS({ ...s, tags: v })} /></Field>
          {err && <span className="full hint text-danger" role="alert">{err}</span>}
        </FormGrid>
      )}
    </Modal>
  );
}
