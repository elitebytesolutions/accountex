"use client";

import "./budgets-screen.css";
import { ChartColumn, Copy, Ellipsis, FilePlus2, PencilRuler, Plus, Receipt, Target, Trash2, TrendingUp, Warehouse } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BudgetInputSchema, BUDGET_TYPES, type Budget, type BudgetDetail, type BudgetList, type BudgetOptions } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid, Input, Select } from "@/components/ui/form";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { initialsOf } from "@/features/auth/initials";
import { isoDay } from "@/features/finance/components/finance-ui";
import { budgetOptions, createBudget, deleteBudget, getBudget, listBudgets, newBudgetVersion } from "../api";
import { BudgetGrid, fmtAmount, STATUS } from "./budget-grid";

type Can = { create: boolean; edit: boolean; approve: boolean; delete: boolean };
type Fy = BudgetOptions["fiscalYears"][number];
type Seed = "BLANK" | "PRIOR_ACTUALS" | "PRIOR_BUDGET";
const TYPE_LABEL: Record<string, string> = { OPERATING: "Operating", CAPITAL: "Capital", DEPARTMENT: "Department", PROJECT: "Project" };
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const errOf = (e: unknown, fallback: string) => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });
const scopeOf = (b: Budget) => b.department ?? b.costCentre?.name ?? b.project?.name ?? (b.branch ? b.branch.name : "Company");
const prevFy = (fys: Fy[], fy: Fy | undefined) => (fy ? [...fys].filter((f) => f.startDate < fy.startDate).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] : undefined);
const neverApproved = (b: Budget) => b.status !== "APPROVED" && !b.versions.some((v) => v.status === "APPROVED" || v.status === "SUPERSEDED");

/** Budgeting › Budgets (template app/budgets, 42-acc-reports.html): budgets per fiscal year with a month-grid editor. */
export function BudgetsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [opts, setOpts] = useState<BudgetOptions | null>(null);
  const [fyId, setFyId] = useState("");
  const [list, setList] = useState<BudgetList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BudgetDetail | null>(null);
  const [detailErr, setDetailErr] = useState<{ message: string; reference?: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState<{ seed: Seed } | null>(null);
  const [removing, setRemoving] = useState<Budget | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    let cancelled = false;
    budgetOptions()
      .then((o) => {
        if (cancelled) return;
        setOpts(o);
        const today = isoDay(new Date());
        setFyId((f) => f || (o.fiscalYears.find((y) => y.startDate <= today && y.endDate >= today) ?? o.fiscalYears[0])?.id || "");
      })
      .catch((e: unknown) => !cancelled && setError(errOf(e, "Could not load budget options")));
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (!opts) return;
    let cancelled = false;
    listBudgets({ fiscalYear: fyId || undefined, pageSize: 200 })
      .then((l) => {
        if (cancelled) return;
        setList(l);
        setError(null);
        setSelId((s) => (s && l.items.some((b) => b.id === s) ? s : l.items[0]?.id ?? null));
      })
      .catch((e: unknown) => !cancelled && setError(errOf(e, "Could not load budgets")));
    return () => { cancelled = true; };
  }, [opts, fyId, attempt]);

  const [detailReq, setDetailReq] = useState<{ forId: string | null; version: string | null; n: number }>({ forId: null, version: null, n: 0 });
  useEffect(() => {
    if (!selId) return;
    let cancelled = false;
    const asked = detailReq.forId === selId ? detailReq.version : null;
    getBudget(selId, asked)
      // With no version asked for, open the version being worked on (draft / in review) rather than the approved one.
      .then((d) => {
        const open = asked ? undefined : d.versions.find((v) => (v.status === "DRAFT" || v.status === "IN_REVIEW") && v.id !== d.version?.id);
        return open ? getBudget(selId, open.id) : d;
      })
      .then((d) => { if (!cancelled) { setDetail(d); setDetailErr(null); setDirty(false); } })
      .catch((e: unknown) => !cancelled && setDetailErr(errOf(e, "Could not load the budget")));
    return () => { cancelled = true; };
  }, [selId, detailReq]);
  const loadDetail = (version: string | null = null) => { setDetailErr(null); setDetailReq((r) => ({ forId: selId, version, n: r.n + 1 })); };

  const reload = () => setAttempt((n) => n + 1);
  const fys = useMemo(() => [...(opts?.fiscalYears ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [opts]);
  const fy = fys.find((f) => f.id === fyId);
  const prev = opts ? prevFy(opts.fiscalYears, fy) : undefined;
  const items = list?.items ?? [];
  const k = list?.kpis;
  const typesHere = [...new Set(items.map((b) => TYPE_LABEL[b.budgetType] ?? b.budgetType))];

  const select = (id: string) => {
    if (id === selId) return;
    if (dirty && !window.confirm("Discard unsaved changes to the open budget?")) return;
    setDetailErr(null);
    setSelId(id);
  };
  const newVersion = async (b: { id: string; name: string }) => {
    if (dirty && !window.confirm("Discard unsaved changes to the open budget?")) return;
    setBusy(true);
    try {
      const d = await newBudgetVersion(b.id);
      toast(`${b.name}: v${d.version?.versionNo ?? ""} created as draft`, { tone: "good" });
      setSelId(b.id);
      setDetailReq((r) => ({ forId: b.id, version: d.version?.id ?? null, n: r.n + 1 }));
      setDetail(d);
      setDirty(false);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not create a new version", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteBudget(removing.id, removing.rowVersion);
      toast(`${removing.name} deleted`, { tone: "good" });
      if (selId === removing.id) setSelId(null);
      setRemoving(null);
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not delete the budget", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const typeText = typesHere.length ? typesHere.join(", ").replace(/, ([^,]*)$/, " and $1") : "Operating, capital and department";
  return (
    <>
      <PageHead
        eyebrow="Budgeting / Budgets"
        title="Budgets"
        description={`${typeText} budgets for ${fy?.code ?? "the fiscal year"} — versioned, approved and tracked against actuals.`}
        actions={
          <>
            <ButtonLink href="/budgets/variance" icon={<ChartColumn />}>Budget vs Actual</ButtonLink>
            {can.create && prev && <Button icon={<Copy />} onClick={() => setCreating({ seed: "PRIOR_BUDGET" })}>Copy from {prev.code}</Button>}
            {can.create && <Button variant="primary" icon={<Plus />} onClick={() => setCreating({ seed: "BLANK" })} disabled={!opts}>New Budget</Button>}
          </>
        }
      />

      <div className="kpi-grid">
        <div className="kpi"><div className="kpi-top"><span>Budgeted revenue</span><span className="icon-well"><TrendingUp /></span></div><strong>{k ? rs(k.revenue) : "…"}</strong><small>Operating budgets · {fy?.code ?? "—"}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Budgeted costs</span><span className="icon-well"><Receipt /></span></div><strong>{k ? rs(k.costs) : "…"}</strong><small>Cost of sales + expense lines</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Budgeted operating result</span><span className="icon-well"><Target /></span></div><strong>{k ? rs(k.result) : "…"}</strong><small>{k && k.revenue ? `${((k.result / k.revenue) * 100).toFixed(1)}% margin` : "No budgeted revenue"}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Capex utilised</span><span className="icon-well"><Warehouse /></span></div><strong>{k ? (k.capexBudget ? `${((k.capexUtilised / k.capexBudget) * 100).toFixed(1)}%` : "—") : "…"}</strong><small>{k ? `${rs(k.capexUtilised)} of ${rs(k.capexBudget)}` : "…"}</small></div>
      </div>

      <div className="panel flush mt">
        <div className="panel-head">
          <div><h3>All budgets</h3><p>{fy?.code ?? "—"} · {list ? `${list.total} budget${list.total === 1 ? "" : "s"}` : "loading…"}</p></div>
          <div className="panel-actions">
            <div className="chips">{fys.map((f) => <button key={f.id} type="button" className={cn(f.id === fyId && "active")} onClick={() => { if (dirty && !window.confirm("Discard unsaved changes to the open budget?")) return; setFyId(f.id); setList(null); }}>{f.code}</button>)}</div>
          </div>
        </div>
        {!list ? (
          <div style={{ padding: 20 }}><Skeleton style={{ height: 180 }} /></div>
        ) : !items.length ? (
          <EmptyState icon={<PencilRuler />} title={`No budgets for ${fy?.code ?? "this year"}`} description="Start blank, or seed a budget from last year's actuals or budget."
            action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => setCreating({ seed: "BLANK" })}>New Budget</Button>} />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Budget</th><th>Type</th><th>Scope</th><th>Version</th><th>Owner</th><th className="num">Amount</th><th>Utilised</th><th>Status</th><th /></tr></thead>
            <tbody>
              {items.map((b) => {
                const u = b.utilisedPct ?? 0;
                const st = STATUS[b.status] ?? [b.status, "neutral"];
                return (
                  <tr key={b.id} className={cn("bud-row", b.id === selId && "selected")} onClick={() => select(b.id)}>
                    <td><b>{b.name}</b><small>{b.code} · {scopeOf(b)}</small></td>
                    <td>{TYPE_LABEL[b.budgetType] ?? b.budgetType}</td>
                    <td>{scopeOf(b)}</td>
                    <td><Badge tone="neutral">v{b.currentVersion?.versionNo ?? 0}</Badge></td>
                    <td>{b.owner ? <div className="cell-user"><span className="avatar sm">{initialsOf(b.owner.name)}</span><div><b>{b.owner.name}</b></div></div> : <span className="muted">—</span>}</td>
                    <td className="num">{fmtAmount(b.amount, 2)}</td>
                    <td><div className={cn("progress", u > 100 ? "danger" : u > 80 && "warn")}><i style={{ width: `${Math.min(100, Math.max(0, u))}%` }} /></div><small>{b.utilisedPct === null ? "—" : `${u.toFixed(1)}%`} · {rs(b.actualToDate)}</small></td>
                    <td><Badge tone={st[1]}>{st[0]}</Badge></td>
                    <td className="actions">
                      <button type="button" className="icon-btn-sm" aria-label="More actions" onClick={(e) => {
                        e.stopPropagation();
                        setMenu({
                          anchor: e.currentTarget,
                          items: [
                            { label: "Open editor", icon: <PencilRuler />, onClick: () => select(b.id) },
                            ...(b.status === "APPROVED" && can.create ? [{ label: "New version", icon: <FilePlus2 />, disabled: busy || b.versions.some((v) => v.status === "DRAFT" || v.status === "IN_REVIEW"), onClick: () => newVersion(b) }] : []),
                            ...(can.delete && neverApproved(b) ? [{ sep: true as const }, { label: "Delete", icon: <Trash2 />, danger: true, onClick: () => setRemoving(b) }] : []),
                          ],
                        });
                      }}><Ellipsis /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>

      {selId && detailErr && <div className="mt"><ErrorState message={detailErr.message} reference={detailErr.reference} onRetry={() => loadDetail(detailReq.version)} /></div>}
      {selId && (!detail || detail.id !== selId) && !detailErr && <div className="panel mt"><Skeleton style={{ height: 260 }} /></div>}
      {detail && opts && detail.id === selId && (
        <BudgetGrid
          key={`${detail.version?.id ?? "none"}:${detail.version?.rowVersion ?? 0}:${detail.version?.status ?? ""}`}
          detail={detail} opts={opts} can={can} busyOuter={busy}
          onDirty={setDirty}
          onSaved={(d) => { setDetail(d); setDirty(false); reload(); }}
          onVersion={(v) => loadDetail(v)}
          onNewVersion={() => newVersion(detail)}
        />
      )}

      {opts && (
        <NewBudgetModal open={!!creating} seed={creating?.seed ?? "BLANK"} opts={opts} fyId={fyId} onClose={() => setCreating(null)}
          onCreated={(d) => {
            setCreating(null);
            toast(`Budget ${d.code} created as draft`, { tone: "good" });
            if (d.fiscalYear.id !== fyId) setFyId(d.fiscalYear.id);
            setSelId(d.id);
            setDetail(d);
            setDirty(false);
            reload();
          }} />
      )}
      {menu && <Menu anchor={menu.anchor} items={menu.items} onClose={closeMenu} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.name ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={remove}>
        The budget and all its draft versions are removed. Approved budgets stay on record and can’t be deleted.
      </ConfirmDialog>
    </>
  );
}

type Form = {
  name: string; fiscalYearId: string; budgetType: string; costCentreId: string; projectId: string; ownerUserId: string; seedFrom: Seed; seedUpliftPct: string; requiresCeoApproval: boolean;
};

/** Template #rpt-new-budget: start blank or seed from last year's actuals / budget. */
function NewBudgetModal({ open, seed, opts, fyId, onClose, onCreated }: {
  open: boolean; seed: Seed; opts: BudgetOptions; fyId: string; onClose: () => void; onCreated: (d: BudgetDetail) => void;
}) {
  const toast = useToast();
  const blank = (): Form => ({ name: "", fiscalYearId: fyId, budgetType: "OPERATING", costCentreId: "", projectId: "", ownerUserId: "", seedFrom: seed, seedUpliftPct: "", requiresCeoApproval: false });
  const [f, setF] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setF(blank()); setErrors({}); }
  }
  const set = <K extends keyof Form>(key: K, v: Form[K]) => setF((x) => ({ ...x, [key]: v }));
  const prev = prevFy(opts.fiscalYears, opts.fiscalYears.find((y) => y.id === f.fiscalYearId));
  const fys = [...opts.fiscalYears].sort((a, b) => b.startDate.localeCompare(a.startDate));

  const submit = async () => {
    const body = {
      name: f.name, fiscalYearId: f.fiscalYearId, budgetType: f.budgetType as (typeof BUDGET_TYPES)[number],
      costCentreId: f.budgetType === "DEPARTMENT" ? f.costCentreId : "", projectId: f.budgetType === "PROJECT" ? f.projectId : "",
      ownerUserId: f.ownerUserId, seedFrom: f.seedFrom, seedUpliftPct: f.seedFrom !== "BLANK" && f.seedUpliftPct.trim() ? f.seedUpliftPct : null, requiresCeoApproval: f.requiresCeoApproval,
    };
    const parsed = BudgetInputSchema.safeParse(body);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const i of parsed.error.issues) { const key = String(i.path[0] ?? "name"); e[key] ??= i.message; }
      setErrors(e);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      onCreated(await createBudget(body));
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(Object.fromEntries(Object.entries(e.details).map(([k, m]) => [k, m[0] ?? "Invalid"])));
      toast(e instanceof ApiError ? e.message : "Could not create the budget", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New budget" subtitle="Start blank or seed from actuals / a prior budget."
      foot={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create budget"}</Button></>}>
      <FormGrid>
        <Field label="Budget name" required full error={errors.name}><Input value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} placeholder="e.g. Finance Department Budget" autoFocus /></Field>
        <Field label="Fiscal year" error={errors.fiscalYearId}>
          <Select value={f.fiscalYearId} onChange={(e) => set("fiscalYearId", e.target.value)} aria-invalid={!!errors.fiscalYearId}>
            {!f.fiscalYearId && <option value="">Choose…</option>}
            {fys.map((y) => <option key={y.id} value={y.id}>{y.code}</option>)}
          </Select>
        </Field>
        <Field label="Type" error={errors.budgetType}>
          <Select value={f.budgetType} onChange={(e) => set("budgetType", e.target.value)}>
            {BUDGET_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        {f.budgetType === "DEPARTMENT" && (
          <Field label="Department / Cost centre" required error={errors.costCentreId ?? errors.department}>
            <Select value={f.costCentreId} onChange={(e) => set("costCentreId", e.target.value)} aria-invalid={!!errors.costCentreId}>
              <option value="">Choose…</option>
              {opts.costCentres.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </Select>
          </Field>
        )}
        {f.budgetType === "PROJECT" && (
          <Field label="Project" required error={errors.projectId}>
            <Select value={f.projectId} onChange={(e) => set("projectId", e.target.value)} aria-invalid={!!errors.projectId}>
              <option value="">Choose…</option>
              {opts.projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Owner" error={errors.ownerUserId} hint={!f.ownerUserId ? "Defaults to you" : undefined}>
          <Select value={f.ownerUserId} onChange={(e) => set("ownerUserId", e.target.value)}>
            <option value="">Me</option>
            {opts.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="Seed from" full={f.seedFrom === "BLANK"} error={errors.seedFrom} hint={f.seedFrom !== "BLANK" && !prev ? "No earlier fiscal year — the budget starts blank" : undefined}>
          <Select value={f.seedFrom} onChange={(e) => set("seedFrom", e.target.value as Seed)}>
            <option value="BLANK">Blank</option>
            <option value="PRIOR_ACTUALS">{prev ? `${prev.code} actuals` : "Prior year actuals"}</option>
            <option value="PRIOR_BUDGET">{prev ? `${prev.code} budget` : "Prior year budget"}</option>
          </Select>
        </Field>
        {f.seedFrom !== "BLANK" && (
          <Field label="Uplift %" error={errors.seedUpliftPct} hint="Applied to every seeded month">
            <Input type="number" step="0.1" value={f.seedUpliftPct} onChange={(e) => set("seedUpliftPct", e.target.value)} aria-invalid={!!errors.seedUpliftPct} placeholder="0" />
          </Field>
        )}
        <Check full label="Require approval from CEO before activation" checked={f.requiresCeoApproval} onChange={(e) => set("requiresCeoApproval", e.target.checked)} />
      </FormGrid>
    </Modal>
  );
}
