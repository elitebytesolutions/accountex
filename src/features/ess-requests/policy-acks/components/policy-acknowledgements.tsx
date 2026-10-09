"use client";

import { ShieldCheck, UserRoundX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PolicyAcknowledgementReport } from "@/shared/self-service/policy-ack";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Av } from "@/features/hr/components/ess-bits";
import { ApiError } from "@/lib/api/errors";
import { policyAcknowledgements } from "../api";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** HR › Policies: who acknowledged a policy version, and which active employees still have to (template style; no admin template). */
export function PolicyAcknowledgementsDrawer({ policyId, title, onClose }: { policyId: string | null; title: string; onClose: () => void }) {
  const [data, setData] = useState<PolicyAcknowledgementReport | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"done" | "pending">("done");

  useEffect(() => {
    if (!policyId) return;
    let cancelled = false;
    policyAcknowledgements(policyId).then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the acknowledgements" }));
    return () => { cancelled = true; };
  }, [policyId, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const d = data?.policy.id === policyId ? data : null;
  const pct = d && d.counts.total ? Math.round((d.counts.acknowledged / d.counts.total) * 100) : 0;

  return (
    <Drawer open={!!policyId} onClose={onClose} wide title="Acknowledgements" subtitle={d ? `${d.policy.code} · v${d.policy.version} · ${d.policy.title}` : title}>
      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !d ? <Skeleton style={{ height: 260 }} /> : (
        <>
          {!d.policy.requiresAcknowledgement || d.policy.status !== "PUBLISHED" ? (
            <div className="banner info mb"><ShieldCheck /><div><b>{d.policy.status !== "PUBLISHED" ? "Not published" : "Acknowledgement not required"}</b>
              <p>{d.policy.status !== "PUBLISHED" ? "Only the published version is shown to employees; acknowledgements already given stay listed." : "Employees can read this policy without signing it."}</p></div></div>
          ) : (
            <div className="mb">
              <div className="row" style={{ gap: 8 }}><b>{d.counts.acknowledged} of {d.counts.total} employees acknowledged</b><span className="spacer" /><span className="small muted">{pct}%</span></div>
              <div className="progress mt" style={{ marginTop: 6 }}><i style={{ width: `${pct}%` }} /></div>
            </div>
          )}
          <div className="chips mb">
            <button type="button" className={cn(tab === "done" && "active")} onClick={() => setTab("done")}>Acknowledged ({d.counts.acknowledged})</button>
            <button type="button" className={cn(tab === "pending" && "active")} onClick={() => setTab("pending")}>Pending ({d.counts.pending})</button>
          </div>
          {tab === "done" ? (!d.acknowledged.length ? <EmptyState icon={<ShieldCheck />} title="No acknowledgements yet" description="Employees sign this version from My Profile › Onboarding & Policies." /> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Employee</th><th>Signed</th><th>Signature</th><th>Read to end</th></tr></thead>
              <tbody>{d.acknowledged.map((a) => (
                <tr key={a.id}>
                  <td><div className="row" style={{ gap: 8 }}><Av name={a.employee.name} /><div><b>{a.employee.name}</b><small className="muted" style={{ display: "block" }}>{[a.employee.code, a.employee.department].filter(Boolean).join(" · ")}</small></div></div></td>
                  <td>{when(a.acknowledgedAt)}</td>
                  <td style={{ fontFamily: "var(--font-hand)", fontSize: 18 }}>{a.signatureText ?? "—"}</td>
                  <td>{a.readToEnd ? <span className="badge dot good">Yes</span> : <span className="badge dot warn">No</span>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )) : (!d.pending.length ? <EmptyState icon={<ShieldCheck />} title="Everyone has acknowledged" description="No active employee is waiting to sign this version." /> : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Employee</th><th>Department</th><th>Branch</th></tr></thead>
              <tbody>{d.pending.map((e) => (
                <tr key={e.id}>
                  <td><div className="row" style={{ gap: 8 }}><Av name={e.name} /><div><b>{e.name}</b><small className="muted" style={{ display: "block" }}>{e.code}{e.designation ? ` · ${e.designation}` : ""}</small></div></div></td>
                  <td>{e.department ?? "—"}</td>
                  <td>{e.branch ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ))}
          {tab === "pending" && d.pending.length > 0 && <p className="small muted mt"><UserRoundX style={{ width: 14, height: 14, verticalAlign: "-2px" }} /> Line managers see their team’s missing signatures on My Profile › My Team.</p>}
        </>
      )}
    </Drawer>
  );
}
