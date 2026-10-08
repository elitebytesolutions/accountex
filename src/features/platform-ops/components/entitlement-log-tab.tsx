"use client";

import { ArrowRight, History, Info, TrendingUp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { EntitlementChangeRow } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { listEntitlementChanges } from "../api";
import { fmtWhen, useLoad } from "./ops-ui";

const TONE: Record<string, "good" | "danger" | "warn"> = { GAIN: "good", LOSS: "danger", NEUTRAL: "warn" };
const val = (r: EntitlementChangeRow, v: unknown) => {
  const o = (v ?? {}) as Record<string, unknown>;
  if (r.changeKind === "FEATURE") return o.included ? "Included" : "—";
  if (r.changeKind === "LIMIT") return o.limit === null || o.limit === undefined ? "∞" : Number(o.limit).toLocaleString("en-PK");
  return `Rs ${Number(o.price ?? 0).toLocaleString("en-PK")}`;
};
const labelOf = (r: EntitlementChangeRow) =>
  r.changeKind === "FEATURE" ? r.moduleName ?? "Module" : r.changeKind === "LIMIT" ? r.meterName ?? "Limit" : `${r.addonName ?? "Add-on"} price`;

/** Plan Entitlements › Change log (Phase 43, template-style addition): past change sets with their impact. */
export function EntitlementLogTab({ reloadKey }: { reloadKey?: number }) {
  const { data, error, reload } = useLoad(listEntitlementChanges, "Could not load the change log");
  const [seen, setSeen] = useState(reloadKey);
  const [history, setHistory] = useState<string | null>(null);
  if (reloadKey !== seen) { setSeen(reloadKey); reload(); }
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 200 }} />;
  if (!data.length) return <div className="panel"><EmptyState icon={<History />} title="No entitlement changes yet" description="Every saved change set is listed here with the tenants it affected." /></div>;
  return (
    <div className="stack">
      {data.map((s) => (
        <div key={s.changeSetId} className="panel">
          <div className="panel-head"><div><h3>{s.rows.length} change{s.rows.length === 1 ? "" : "s"} · {s.tenantsAffected} tenants affected</h3>
            <p>{fmtWhen(s.savedAt)} PKT · {s.savedBy ?? "—"} · {s.grandfatherUntilRenewal ? "grandfathered until renewal" : "applies now"}{s.emailOwners ? " · owners emailed" : ""}{s.postChangelog ? " · in-app changelog" : ""}</p></div>
            <div className="panel-actions"><button type="button" className="btn ghost sm" onClick={() => setHistory(s.rows[0]!.id)}><History />History</button></div></div>
          <div className="ff-implist">
            {s.rows.map((r) => {
              const tone = TONE[r.impactTone ?? "NEUTRAL"] ?? "warn";
              return (
                <div key={r.id} className={cn("ff-imp", tone)}>
                  <span className="ff-imp-ic">{tone === "good" ? <TrendingUp /> : tone === "danger" ? <TriangleAlert /> : <Info />}</span>
                  <div><div className="ff-imp-top"><b>{labelOf(r)}</b>{r.planName && <span className="pill">{r.planName}</span>}</div>
                    <div className="ff-imp-ch"><s>{val(r, r.fromValue)}</s><ArrowRight /><b>{val(r, r.toValue)}</b></div></div>
                  <b className="ff-imp-n">{r.tenantsAffected}</b>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <Modal open={!!history} onClose={() => setHistory(null)} title="Change log row history" wide>
        {history && <AdminHistoryTab table="EntitlementChangeLogs" id={history} />}
      </Modal>
    </div>
  );
}
