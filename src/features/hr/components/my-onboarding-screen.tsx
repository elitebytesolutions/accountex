"use client";

import { CalendarClock, Check, CircleCheck, Coffee, FolderCheck, GraduationCap, Laptop, LifeBuoy, ListChecks, Receipt, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { MyOnboarding } from "@/shared";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { completeMyTask, myOnboarding } from "../lifecycle-api";
import { dmy } from "./attendance-ui";
import { Av, EsRing } from "./ess-bits";

const GROUP_ICON: Record<string, typeof FolderCheck> = { DOCUMENTS: FolderCheck, STATUTORY_FINANCE: Receipt, IT_ADMIN: Laptop, ORIENTATION: Sparkles, POLICIES: ShieldCheck, BUDDY: Coffee, TRAINING: GraduationCap };
const DONE = ["COMPLETED", "SKIPPED"];
type Task = NonNullable<MyOnboarding["onboarding"]>["tasks"][number];

/** Template app/profile/onboarding (6A-ess.html + 9C-ess.js): progress ring, grouped checklist (the joiner completes their own steps), buddy. The CEO note, policy reader, buddy booking and training player have no data source yet (Phase 34). */
export function MyOnboardingScreen({ can }: { can: { edit: boolean } }) {
  const toast = useToast();
  const lookups = useLookups(["TaskGroup", "OwnerFunction", "Track"]);
  const [data, setData] = useState<MyOnboarding | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [just, setJust] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    myOnboarding().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your onboarding" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 420 }} />;

  const o = data.onboarding;
  const head = <PageHead eyebrow="My Profile / Onboarding" title={o ? `Your ${(labelOf(lookups, "Track", o.track) || "new joiner").toLowerCase()} onboarding` : "Onboarding & Policies"}
    description={o ? `Finish these steps to settle in${o.targetDate ? ` by ${dmy(o.targetDate)}` : ""}.` : "Your onboarding checklist appears here when HR starts it."}
    actions={<Link className="btn secondary" href="/profile/helpdesk"><LifeBuoy />Need help?</Link>} />
  if (!o) return <>{head}<div className="es-card"><div className="es-empty"><span className="icon-tile"><ListChecks /></span><b>No onboarding in progress</b><span>{data.myId ? "HR starts an onboarding checklist for new joiners and role changes." : "Your user isn’t linked to an employee record yet. Ask HR to link it."}</span></div></div></>;

  const mine = (t: Task) =>
    (t.ownerFunction === "EMPLOYEE" || t.owner?.id === data.myId) && t.actionKind !== "POLICY_ACK";
  const total = o.tasks.length, done = o.tasks.filter((t) => DONE.includes(t.status)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const groups = [...new Set(o.tasks.map((t) => t.taskGroup))];
  const open = o.status === "PRE_JOINING" || o.status === "IN_PROGRESS";
  const complete = async (id: string, rowVersion: number) => {
    setBusy(id);
    try { const r = await completeMyTask(id, rowVersion, null); setData(r); setJust(id); toast(r.onboarding?.status === "COMPLETED" ? "Onboarding complete · welcome aboard!" : "Step done", { tone: "good" }); }
    catch (e) { toast(apiMessage(e, "Could not complete the step"), { tone: "danger" }); } finally { setBusy(null); }
  };

  return (
    <>
      {head}
      <div className="es-grid es-wide es-ob-top">
        <div className="es-card night es-ob-ceo">
          <span className="es-ob-eye">Welcome aboard</span>
          <h2>Good to have you with us, {o.employee.name.split(" ")[0]}.</h2>
          <p>Your {(labelOf(lookups, "Track", o.track) || "onboarding").toLowerCase()} checklist{o.template ? ` (${o.template.name})` : ""} started on {dmy(o.startDate)}{o.joiningDate ? ` for your joining on ${dmy(o.joiningDate)}` : ""}. HR, IT, Admin, Finance and your manager complete their steps; the ones marked for you are yours to tick off here.</p>
          <div className="es-ob-sign"><Av name={o.employee.name} /><div><span className="es-ob-hand">{o.employee.name}</span><small>{[o.designation ?? o.employee.designation, o.employee.department].filter(Boolean).join(" · ")}</small></div></div>
        </div>
        <div className={`es-card es-ob-pcard${pct === 100 ? " complete" : ""}`}>
          <div className="es-head"><h3>Your progress</h3><span className="spacer" /><span className="pill"><Sparkles />{labelOf(lookups, "Track", o.track) || o.track} track</span></div>
          <div className="es-ob-ringrow">
            <EsRing pct={pct} size={132} stroke={3.2} label={`${pct}%`} sub="complete" />
            <div className="es-ob-msg">{pct === 100 ? <><b>You’re all set!</b><span>HR has been notified that your onboarding is complete.</span></> : <>
              <b>{done} of {total} steps done</b><span>{total - done} left{o.overdue ? ` · ${o.overdue} overdue` : ""}</span>
              <span className="es-label">Started {dmy(o.startDate)}{o.targetDate ? ` · target ${dmy(o.targetDate)}` : ""}</span></>}</div>
          </div>
          <div className="es-ob-legend">{groups.map((g) => { const items = o.tasks.filter((t) => t.taskGroup === g); const ok = items.every((t) => DONE.includes(t.status)); const Ic = ok ? CircleCheck : GROUP_ICON[g] ?? ListChecks; return <span key={g} className={ok ? "ok" : ""}><Ic />{labelOf(lookups, "TaskGroup", g) || g}</span>; })}</div>
        </div>
      </div>

      <div className="es-grid es-main">
        <div className="es-col">
          {groups.map((g) => {
            const items = o.tasks.filter((t) => t.taskGroup === g);
            const d = items.filter((t) => DONE.includes(t.status)).length;
            const Ic = GROUP_ICON[g] ?? ListChecks;
            return (
              <div key={g} className={`es-card es-ob-group${d === items.length ? " complete" : ""}`}>
                <div className="es-head"><span className={`icon-tile${d === items.length ? " lime" : ""}`}><Ic /></span><h3>{labelOf(lookups, "TaskGroup", g) || g}</h3><span className="spacer" /><span className="es-count">{d}/{items.length}</span></div>
                <ul className="es-ob-list">{items.map((t, i) => {
                  const isDone = DONE.includes(t.status);
                  return (
                    <li key={t.id} className={`es-ob-item es-in${isDone ? " done" : ""}${just === t.id ? " es-ob-just" : ""}`} style={{ ["--i" as string]: i } as CSSProperties}>
                      <span className="es-ob-ck"><Check /></span>
                      <div className="es-ob-txt"><b>{t.title}</b><small>{isDone ? `${t.status === "SKIPPED" ? "Skipped" : "Done"}${t.completedBy ? ` by ${t.completedBy.name}` : ""}${t.completedAt ? ` · ${dmy(t.completedAt.slice(0, 10))}` : ""}` : `${t.owner ? t.owner.name : labelOf(lookups, "OwnerFunction", t.ownerFunction) || t.ownerFunction}${t.description ? ` · ${t.description}` : ""}`}</small>
                        {!isDone && t.progressPct > 0 && <div className="progress es-ob-prog"><i style={{ width: `${t.progressPct}%` }} /></div>}</div>
                      {isDone ? <span className="es-ob-ok">Done</span> : <>
                        {t.dueOn && <span className={`pill es-ob-due${t.overdue ? " neg" : ""}`}><CalendarClock />Due {dmy(t.dueOn).slice(0, 6)}</span>}
                        {can.edit && open && mine(t) ? <button className="btn primary sm" type="button" disabled={busy === t.id} onClick={() => complete(t.id, t.rowVersion)}>{busy === t.id ? "Saving…" : "Mark done"}</button>
                          : t.actionKind === "POLICY_ACK" ? <span className="pill" title="Policy acknowledgements open with My Profile › Policies (Phase 34)">Read & agree soon</span> : null}
                      </>}
                    </li>
                  );
                })}</ul>
              </div>
            );
          })}
        </div>
        <div className="es-col">
          <div className="es-card"><div className="es-head"><h3>Your buddy</h3></div>
            {o.buddy ? <div className="es-ob-buddy"><Av name={o.buddy.name} size="lg" /><div><b>{o.buddy.name}</b><small>Your onboarding buddy</small></div></div> : <p className="es-hint">No buddy assigned yet.</p>}
          </div>
          <div className="es-card"><div className="es-head"><h3>Key contacts</h3></div>
            {[...new Map(o.tasks.filter((t) => t.owner && t.owner.id !== data.myId).map((t) => [t.owner!.id, { name: t.owner!.name, role: labelOf(lookups, "OwnerFunction", t.ownerFunction) || t.ownerFunction }])).values()].slice(0, 5).map((c) => (
              <div key={c.name} className="es-ob-ct"><Av name={c.name} size="sm" /><div><b>{c.name}</b><small>{c.role}</small></div></div>
            ))}
            {!o.tasks.some((t) => t.owner && t.owner.id !== data.myId) && <p className="es-hint">HR, IT, Admin and Finance handle the remaining steps.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
