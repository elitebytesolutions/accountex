"use client";

import { Award, Calculator, Check, CircleX, Medal, Pencil, Plus, Send, Target, Trash2, Trophy, UserRound, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DistributionOpsOptions, SalesmanCommission, SalesmanTarget, TargetsOverview } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { ApiError } from "@/lib/api/errors";
import { calculateCommissions, commissionAction, createTarget, deleteTarget, distributionOpsOptions, targetsOverview, updateTarget } from "../api";

export type TargetsCan = { view: boolean; create: boolean; edit: boolean; approve: boolean; post: boolean };

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-US")}`;
const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const pad = (n: number) => String(n).padStart(2, "0");
const monthBounds = (ym: string) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return { start: `${ym}-01`, end: `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
};
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const COMM: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" }, APPROVED: { label: "Approved", tone: "info" }, ACCRUED: { label: "Posted", tone: "good" },
  PAID: { label: "Paid", tone: "good" }, CANCELLED: { label: "Cancelled", tone: "danger" },
};
const ROLE_LABEL: Record<string, string> = { BOOKER: "Booker", SALESMAN: "Salesman" };

/* One fetch shared by the people cards, the leaderboard and the manager (they refresh together). */
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
function useOverview(enabled: boolean) {
  const [data, setData] = useState<TargetsOverview | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => { if (enabled) targetsOverview().then((d) => { setData(d); setFailed(false); }).catch(() => setFailed(true)); }, [enabled]);
  useEffect(() => {
    load();
    listeners.add(load);
    return () => { listeners.delete(load); };
  }, [load]);
  return { data, failed };
}

/** The latest period's targets, one card per employee (both roles summed). */
function people(data: TargetsOverview | null) {
  if (!data?.targets.length) return [];
  const latest = data.targets.reduce((a, t) => (t.periodStart > a ? t.periodStart : a), "");
  const cur = data.targets.filter((t) => t.periodStart === latest);
  const by = new Map<string, { id: string; name: string; target: number; ach: number; comm: number; rate: number | null; roles: { role: string; route: string | null }[] }>();
  for (const t of cur) {
    const p = by.get(t.employee.id) ?? { id: t.employee.id, name: t.employee.name, target: 0, ach: 0, comm: 0, rate: null, roles: [] };
    p.target += t.targetAmount;
    p.ach += t.achievedAmount;
    p.roles.push({ role: t.role, route: t.route?.code ?? null });
    const c = data.commissions.find((x) => x.target.id === t.id && x.status !== "CANCELLED");
    if (c) { p.comm += c.commissionAmount; p.rate = c.ratePct; }
    by.set(t.employee.id, p);
  }
  return [...by.values()].map((p) => ({ ...p, pct: p.target > 0 ? (p.ach / p.target) * 100 : 0 }));
}

/** Booker & salesman cards (template "Bookers & salesmen"): achievement against target and commission. */
export function TargetsPeople({ can }: { can: TargetsCan }) {
  const { data, failed } = useOverview(can.view);
  const ppl = useMemo(() => people(data), [data]);
  if (!data && !failed) return <div className="ds-people">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 210 }} />)}</div>;
  if (!ppl.length) return <div className="panel"><EmptyState icon={<Target />} title="No targets yet" description={can.create ? "Set a target for each booker and salesman below; achievement fills in from their posted invoices." : "Booker and salesman cards appear once targets are set."} /></div>;
  return (
    <div className="ds-people">
      {ppl.map((p, i) => (
        <article key={p.id} className="ds-person" style={{ ["--i" as string]: i }}>
          <div className="ds-pp-top"><span className="avatar lg">{initials(p.name)}</span><div><b>{p.name}</b>
            <div className="ds-roles">{p.roles.map((r, k) => <Badge key={k} tone={r.role === "BOOKER" ? "info" : "violet"}>{ROLE_LABEL[r.role] ?? r.role}{r.route ? ` · ${r.route}` : ""}</Badge>)}</div></div></div>
          <div className="ds-target"><div className="ds-tg-top"><span>Target achievement</span><b className={p.pct >= 100 ? "up" : undefined}>{p.pct.toFixed(0)}%</b></div>
            <div className="ds-tg-track"><i style={{ ["--w" as string]: `${Math.min(100, (p.pct / 130) * 100)}%` }} /><em style={{ left: `${(100 / 130) * 100}%` }} /></div>
            <small>{rs(p.ach)} of {rs(p.target)}</small></div>
          <div className="ds-pp-stats">
            <div><small>Target</small><b>{rs(p.target)}</b></div>
            <div><small>Achieved</small><b>{rs(p.ach)}</b></div>
            <div><small>Commission</small><b>{p.comm ? rs(p.comm) : "—"}</b>{p.rate !== null && <em>{p.rate.toFixed(1)}% slab</em>}</div>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Leaderboard (template): ranked by achievement against target. */
export function TargetsLeaderboard({ can }: { can: TargetsCan }) {
  const { data } = useOverview(can.view);
  const ranked = useMemo(() => people(data).sort((a, b) => b.pct - a.pct), [data]);
  const medal = [<Trophy key="t" />, <Medal key="m" />, <Award key="a" />];
  return (
    <div className="panel"><div className="panel-head"><div><h3>Leaderboard</h3><p>Ranked by achievement against target.</p></div><span className="icon-well yellow"><Trophy /></span></div>
      {ranked.length ? (
        <div className="ds-leader">{ranked.map((p, i) => (
          <div key={p.id} className={cn("ds-lb", `r${i + 1}`)} style={{ ["--i" as string]: i }}>
            <span className="ds-lb-rank">{i < 3 ? medal[i] : i + 1}</span><span className="avatar sm">{initials(p.name)}</span>
            <div className="ds-lb-main"><b>{p.name}</b><div className="ds-lb-bar"><i style={{ ["--w" as string]: `${Math.min(100, (p.pct / 130) * 100)}%` }} /></div></div>
            <b className="ds-lb-pct">{p.pct.toFixed(1)}%</b></div>
        ))}</div>
      ) : <EmptyState icon={<UserRound />} title="No targets yet" description="The leaderboard ranks bookers and salesmen once targets are set." />}
    </div>
  );
}

type Form = { id: string | null; rowVersion: number; employeeId: string; role: string; routeId: string; periodStart: string; periodEnd: string; targetAmount: string };

/**
 * Targets & commissions manager: targets per booker / salesman and period (achievement from posted invoices, net of
 * credit notes), commissions calculated from the slabs, approved, posted as an accrual and sent to the month's draft
 * payroll run.
 */
export function TargetsManager({ can }: { can: TargetsCan }) {
  const toast = useToast();
  const { data } = useOverview(can.view);
  const [opts, setOpts] = useState<DistributionOpsOptions | null>(null);
  const [tab, setTab] = useState<"targets" | "commissions">("targets");
  const [month, setMonth] = useState(thisMonth());
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<SalesmanTarget | null>(null);

  useEffect(() => { distributionOpsOptions().then(setOpts).catch(() => setOpts(null)); }, []);

  const fail = (e: unknown, fallback: string) => {
    if (e instanceof ApiError) setErrs(Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]) => [k, v[0] ?? ""])));
    toast(e instanceof ApiError ? e.message : fallback, { tone: "danger" });
  };

  const openNew = () => {
    const b = monthBounds(month);
    setErrs({});
    setForm({ id: null, rowVersion: 0, employeeId: "", role: "SALESMAN", routeId: "", periodStart: b.start, periodEnd: b.end, targetAmount: "" });
  };
  const openEdit = (t: SalesmanTarget) => {
    setErrs({});
    setForm({ id: t.id, rowVersion: t.rowVersion, employeeId: t.employee.id, role: t.role, routeId: t.route?.id ?? "", periodStart: t.periodStart, periodEnd: t.periodEnd, targetAmount: String(t.targetAmount) });
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = { employeeId: form.employeeId, role: form.role, routeId: form.routeId || null, periodStart: form.periodStart, periodEnd: form.periodEnd, targetAmount: Number(form.targetAmount || 0) };
      if (form.id) await updateTarget(form.id, { ...body, rowVersion: form.rowVersion });
      else await createTarget(body);
      toast(form.id ? "Target updated" : "Target added", { tone: "good" });
      setForm(null);
      changed();
    } catch (e) { fail(e, "Could not save the target"); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    try { await deleteTarget(del.id, del.rowVersion); toast("Target removed", { tone: "good" }); setDel(null); changed(); }
    catch (e) { fail(e, "Could not remove the target"); } finally { setBusy(false); }
  };

  const calculate = async () => {
    const b = monthBounds(month);
    setBusy(true);
    try { await calculateCommissions(b.start, b.end); toast("Achievement refreshed and commissions calculated", { tone: "good" }); setTab("commissions"); changed(); }
    catch (e) { fail(e, "Could not calculate commissions"); } finally { setBusy(false); }
  };

  const act = async (c: SalesmanCommission, a: "approve" | "post" | "cancel" | "send-to-payroll") => {
    setBusy(true);
    try {
      const r = await commissionAction(c.id, a, c.rowVersion);
      toast(a === "send-to-payroll" ? `Sent to payroll run ${r.payrollRun?.docNo ?? ""}` : a === "post" ? "Commission posted (accrued)" : a === "approve" ? "Commission approved" : "Commission cancelled", { tone: "good" });
      changed();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not update the commission", { tone: e instanceof ApiError && e.code === "COMMISSION_NO_PAYROLL_RUN" ? "warn" : "danger" });
    } finally { setBusy(false); }
  };

  const b = monthBounds(month);
  const targets = (data?.targets ?? []).filter((t) => t.periodStart >= b.start && t.periodEnd <= b.end);
  const comms = (data?.commissions ?? []).filter((c) => c.periodStart >= b.start && c.periodEnd <= b.end);
  const staff = (opts?.employees ?? []).filter((e) => (form?.role === "BOOKER" ? e.isBooker : e.isSalesman) || e.id === form?.employeeId);
  const roles = opts?.lookups.targetRoles.length ? opts.lookups.targetRoles : [{ code: "BOOKER", label: "Booker" }, { code: "SALESMAN", label: "Salesman" }];

  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Targets &amp; commissions</h3><p>Achievement comes from posted invoices booked or sold by each person, net of credit notes.</p></div>
        <div className="panel-actions">
          <input type="month" className="input" aria-label="Period" value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} style={{ height: 36 }} />
          {can.edit && <Button size="sm" icon={<Calculator />} onClick={() => void calculate()} disabled={busy}>Calculate commissions</Button>}
          {can.create && <Button size="sm" variant="primary" icon={<Plus />} onClick={openNew}>New target</Button>}
        </div></div>
      <div style={{ padding: "0 20px" }}>
        <Tabs items={[{ key: "targets", label: "Targets", count: targets.length }, { key: "commissions", label: "Commissions", count: comms.length }]} active={tab} onChange={setTab} />
      </div>
      {tab === "targets" ? (
        targets.length ? (
          <div className="table-wrap"><table className="tbl ds-tbl" data-plain>
            <thead><tr><th>Employee</th><th>Role</th><th>Route</th><th>Period</th><th className="num">Target</th><th className="num">Achieved</th><th className="num">%</th><th>Commission</th><th /></tr></thead>
            <tbody>{targets.map((t) => (
              <tr key={t.id}>
                <td><b>{t.employee.name}</b><small>{t.employee.code}</small></td>
                <td><Badge tone={t.role === "BOOKER" ? "info" : "violet"}>{ROLE_LABEL[t.role] ?? t.role}</Badge></td>
                <td>{t.route ? `${t.route.code} · ${t.route.name}` : <span className="muted">All routes</span>}</td>
                <td>{dateLabel(t.periodStart)} – {dateLabel(t.periodEnd)}</td>
                <td className="num">{rs(t.targetAmount)}</td><td className="num">{rs(t.achievedAmount)}</td>
                <td className="num"><b className={t.achievementPct >= 100 ? "up" : undefined} style={t.achievementPct >= 100 ? { color: "var(--good)" } : undefined}>{t.achievementPct.toFixed(1)}%</b></td>
                <td>{t.commission ? <><Badge tone={COMM[t.commission.status]?.tone ?? "neutral"} dot>{COMM[t.commission.status]?.label ?? t.commission.status}</Badge> <small>{rs(t.commission.amount)}</small></> : <span className="muted">—</span>}</td>
                <td className="actions">
                  {can.edit && (!t.commission || t.commission.status === "DRAFT") && <button type="button" className="icon-btn-sm" title="Edit" aria-label="Edit target" onClick={() => openEdit(t)}><Pencil /></button>}
                  {can.edit && !t.commission && <button type="button" className="icon-btn-sm" title="Remove" aria-label="Remove target" onClick={() => setDel(t)}><Trash2 /></button>}
                </td>
              </tr>
            ))}</tbody></table></div>
        ) : <EmptyState icon={<Target />} title="No targets for this month" description={can.create ? "Add a target for each booker and salesman." : "Targets set for this month appear here."}
          action={can.create ? <Button variant="primary" icon={<Plus />} onClick={openNew}>New target</Button> : undefined} />
      ) : (
        comms.length ? (
          <div className="table-wrap"><table className="tbl ds-tbl" data-plain>
            <thead><tr><th>Employee</th><th>Period</th><th className="num">Achieved</th><th className="num">%</th><th>Slab</th><th className="num">Rate</th><th className="num">Commission</th><th>Status</th><th>Payroll</th><th /></tr></thead>
            <tbody>{comms.map((c) => (
              <tr key={c.id}>
                <td><b>{c.employee.name}</b><small>{ROLE_LABEL[c.target.role] ?? c.target.role}</small></td>
                <td>{dateLabel(c.periodStart)} – {dateLabel(c.periodEnd)}</td>
                <td className="num">{rs(c.achievedAmount)}</td><td className="num">{c.achievementPct.toFixed(1)}%</td>
                <td>{c.slab?.label ?? "—"}</td><td className="num">{c.ratePct.toFixed(1)}%</td><td className="num"><b>{rs(c.commissionAmount)}</b></td>
                <td><Badge tone={COMM[c.status]?.tone ?? "neutral"} dot>{COMM[c.status]?.label ?? c.status}</Badge>{c.journal && <small>{c.journal.docNo}</small>}</td>
                <td>{c.payrollRun ? <Badge tone="good"><Wallet />{c.payrollRun.docNo}</Badge> : <span className="muted">—</span>}</td>
                <td className="actions" style={{ whiteSpace: "nowrap" }}>
                  {c.status === "DRAFT" && can.approve && <Button size="sm" icon={<Check />} onClick={() => void act(c, "approve")} disabled={busy}>Approve</Button>}
                  {c.status === "APPROVED" && can.post && <Button size="sm" variant="primary" icon={<Check />} onClick={() => void act(c, "post")} disabled={busy}>Post</Button>}
                  {c.status === "ACCRUED" && !c.payrollRun && can.post && <Button size="sm" icon={<Send />} onClick={() => void act(c, "send-to-payroll")} disabled={busy}>Send to payroll</Button>}
                  {(c.status === "DRAFT" || c.status === "APPROVED") && can.approve && <button type="button" className="icon-btn-sm" title="Cancel" aria-label="Cancel commission" onClick={() => void act(c, "cancel")} disabled={busy}><CircleX /></button>}
                </td>
              </tr>
            ))}</tbody></table></div>
        ) : <EmptyState icon={<Calculator />} title="No commissions for this month" description={can.edit ? "Calculate commissions once the month's invoices are posted." : "Calculated commissions appear here."} />
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit target" : "New target"} subtitle="Achievement is refreshed from posted invoices when you save."
        foot={<><Button onClick={() => setForm(null)}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={busy}>{form?.id ? "Save" : "Add target"}</Button></>}>
        {form && (
          <FormGrid>
            <Field label="Role" required error={errs.role}>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select>
            </Field>
            <Field label="Employee" required error={errs.employeeId}>
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">Choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Route" hint="Leave empty to count every route" error={errs.routeId}>
              <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
                <option value="">All routes</option>{opts?.routes.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.name}</option>)}
              </select>
            </Field>
            <Field label="Target amount" required error={errs.targetAmount}>
              <input inputMode="decimal" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value.replace(/[^\d.]/g, "") })} placeholder="0" />
            </Field>
            <Field label="From" required error={errs.periodStart}><input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></Field>
            <Field label="To" required error={errs.periodEnd}><input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></Field>
          </FormGrid>
        )}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => void remove()} title="Remove target?" confirmLabel="Remove" danger busy={busy}>
        {del && <p>The {ROLE_LABEL[del.role]?.toLowerCase() ?? del.role} target for {del.employee.name} ({dateLabel(del.periodStart)} – {dateLabel(del.periodEnd)}) will be removed.</p>}
      </ConfirmDialog>
    </div>
  );
}
