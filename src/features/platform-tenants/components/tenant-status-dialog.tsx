"use client";

import { CirclePause, CirclePlay, CircleHelp, TriangleAlert, UserX } from "lucide-react";
import { useState } from "react";
import { tenantActionError } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { getTenant, setTenantStatus } from "../api";

export type StatusAction = "suspend" | "reactivate" | "churn";
type Target = { id: string; displayName: string; code: string; status: string; rowVersion?: number };

const COPY: Record<StatusAction, { verb: string; done: string; text: (n: string) => string; danger: boolean }> = {
  suspend: { verb: "Suspend", done: "suspended", danger: true, text: (n) => `${n} will be signed out and blocked: every live session is revoked. Data is retained and scheduled jobs pause until reactivated.` },
  reactivate: { verb: "Reactivate", done: "reactivated", danger: false, text: (n) => `${n} can sign in again with full access.` },
  churn: { verb: "Mark as churned", done: "marked as churned", danger: true, text: (n) => `${n} leaves Accountex: sign-in is refused for good. Records are kept (companies are never deleted).` },
};

/**
 * Suspend (reason) / Reactivate / Churn (ChurnReason lookup) for one or more companies, with the template's confirm
 * box (9B confirmBox; a single company asks for its code to be typed before suspending or churning).
 */
export function TenantStatusDialog({ action: requested, tenants: requestedTenants, onClose, onDone }: { action: StatusAction | null; tenants: Target[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const lookups = useAdminLookups(["ChurnReason"]);
  const [reason, setReason] = useState("");
  const [churnReason, setChurnReason] = useState("");
  const [typed, setTyped] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  // keep the last content while the modal plays its closing animation
  const [last, setLast] = useState<{ action: StatusAction; tenants: Target[] } | null>(null);
  const key = requested ? `${requested}:${requestedTenants.map((t) => t.id).join(",")}` : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (requested) { setLast({ action: requested, tenants: requestedTenants }); setReason(""); setChurnReason(""); setTyped(""); setErrors({}); }
  }
  const action = requested ?? last?.action;
  const tenants = requested ? requestedTenants : (last?.tenants ?? []);
  if (!action) return null;
  const c = COPY[action];
  const eligible = tenants.filter((t) => !tenantActionError(t.status, action));
  const skipped = tenants.length - eligible.length;
  const single = tenants.length === 1 ? tenants[0]! : null;
  const names = single ? single.displayName : `${tenants.length} tenants`;
  const needType = !!single && action !== "reactivate";
  const ready = eligible.length > 0 && (!needType || typed.trim().toLowerCase() === single!.code.toLowerCase()) && (action !== "suspend" || reason.trim().length >= 3) && (action !== "churn" || !!churnReason);

  const run = async () => {
    setBusy(true);
    const results = await Promise.allSettled(eligible.map(async (t) => {
      const rowVersion = t.rowVersion ?? (await getTenant(t.id)).rowVersion;
      return setTenantStatus(t.id, action, { rowVersion, reason: reason.trim() || undefined, churnReason: action === "churn" ? churnReason : undefined });
    }));
    setBusy(false);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const first = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (first && single) { setErrors(adminFieldErrors(first.reason)); toast(adminErrorMessage(first.reason, `Could not ${c.verb.toLowerCase()} the company`), { tone: "danger" }); return; }
    toast(`${ok === 1 && single ? single.displayName : `${ok} tenant${ok === 1 ? "" : "s"}`} ${c.done}${skipped ? ` · ${skipped} skipped` : ""}${first ? ` · ${results.length - ok} failed: ${adminErrorMessage(first.reason, "error")}` : ""}`, { tone: action === "reactivate" ? "good" : "danger" });
    onDone();
  };

  const Icon = action === "suspend" ? CirclePause : action === "churn" ? UserX : CirclePlay;
  return (
    <Modal open={!!requested} onClose={onClose} title={`${c.verb} ${names}?`}
      foot={<>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={cn("btn", c.danger ? "danger solid" : "primary")} disabled={busy || !ready} onClick={run}>{busy ? "Working…" : <><Icon />{action === "suspend" ? "Suspend tenant" : c.verb}</>}</button>
      </>}>
      <div className={cn("ap-confirm", c.danger && "danger")}>
        <span className={cn("icon-tile", c.danger && "red")}>{c.danger ? <TriangleAlert /> : <CircleHelp />}</span>
        <p>{c.text(names)}</p>
      </div>
      {skipped > 0 && <p className="muted small">{skipped} of the selected cannot be {c.done}: {tenants.filter((t) => tenantActionError(t.status, action)).map((t) => t.displayName).join(", ")}.</p>}
      <div className="form-grid c1 ap-mt">
        {action === "churn" && (
          <label><span>Churn reason *</span>
            <select value={churnReason} onChange={(e) => setChurnReason(e.target.value)} aria-invalid={!!errors.churnReason}>
              <option value="">Choose a reason…</option>
              {(lookups.ChurnReason ?? []).map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            {errors.churnReason && <small className="hint text-danger">{errors.churnReason}</small>}
          </label>
        )}
        {action !== "reactivate" && (
          <label><span>{action === "suspend" ? "Reason *" : "Note"}</span>
            <textarea rows={2} value={reason} maxLength={300} placeholder={action === "suspend" ? "e.g. Unpaid since August, owner informed" : "Anything the team should know"} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} />
            {errors.reason && <small className="hint text-danger">{errors.reason}</small>}
          </label>
        )}
        {needType && <label className="field"><span>Type <b className="code">{single!.code.toUpperCase()}</b> to confirm</span><input value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></label>}
      </div>
    </Modal>
  );
}
