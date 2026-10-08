"use client";

import { Eye, VenetianMask } from "lucide-react";
import { useState } from "react";
import type { ImpersonationSession, TenantDetail } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { startImpersonation } from "../api";
import { asList } from "./tenant-ui";

/**
 * Template "Impersonate a user" modal (9B 633–656): sign in as, linked ticket, reason, 30 / 60 minutes, read-only
 * switch and the banner preview. On start the server sets the workspace cookie; the workspace opens in a new tab.
 */
export function ImpersonateModal({ tenant, open, presetUserId, staffName, onClose, onStarted }: {
  tenant: TenantDetail;
  open: boolean;
  presetUserId?: string | null;
  staffName: string;
  onClose: () => void;
  onStarted: (s: ImpersonationSession) => void;
}) {
  const toast = useToast();
  const active = tenant.users.filter((u) => u.status === "ACTIVE");
  const [f, setF] = useState({ who: "", ticket: "", reason: "", mins: 30 as 30 | 60, ro: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = open ? `open:${presetUserId ?? ""}` : null;
  if (key !== openedFor) {
    setOpenedFor(key);
    if (open) { setErrors({}); setF({ who: presetUserId ?? tenant.defaultUserId ?? active[0]?.id ?? "", ticket: "", reason: "", mins: 30, ro: true }); }
  }
  const who = tenant.users.find((u) => u.id === f.who);

  const start = async () => {
    if (f.reason.trim().length < 5) { setErrors({ reason: "Say why you need access" }); toast("Add a reason before impersonating", { tone: "warn" }); return; }
    // open the tab inside the click so the browser does not block it; it is pointed at the workspace once the session exists
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const reason = f.ticket.trim() ? `${f.ticket.trim()} · ${f.reason.trim()}` : f.reason.trim();
      const r = await startImpersonation(tenant.id, { targetUserId: f.who || undefined, reason, timeLimitMinutes: f.mins, isReadOnly: f.ro });
      if (tab) tab.location.href = r.openUrl; else window.open(r.openUrl, "_blank");
      toast(`Signed in as ${r.session.targetUserLabel} for ${f.mins} min · ${f.ro ? "read-only" : "full access"}`, { tone: "info" });
      onStarted(r.session);
    } catch (e) {
      tab?.close();
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not start the support session"), { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Impersonate a user" subtitle="Sessions are time-boxed, recorded and visible to the company." wide
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || !active.length} onClick={start}>{busy ? <><span className="ap-spin" />Starting secure session…</> : <><VenetianMask />Start session</>}</button></>}>
      <div className="form-grid">
        <label><span>Sign in as</span>
          <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}>
            {active.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.isDefault ? "Default user" : asList(u.roles).slice(0, 2).join(", ") || "No role"}</option>)}
          </select>
          {errors.targetUserId && <small className="hint text-danger">{errors.targetUserId}</small>}
        </label>
        <label><span>Linked ticket</span><input value={f.ticket} maxLength={40} placeholder="e.g. TCK-2291" onChange={(e) => setF({ ...f, ticket: e.target.value })} /></label>
        <label className="full"><span>Reason *</span><textarea rows={3} value={f.reason} maxLength={450} placeholder="Why do you need to sign in as this user?" aria-invalid={!!errors.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />{errors.reason && <small className="hint text-danger" role="alert">{errors.reason}</small>}</label>
      </div>
      <div className="ap-imp-opts">
        <div><div className="ap-lbl">Time limit</div><div className="seg">{([30, 60] as const).map((m) => <button key={m} type="button" className={f.mins === m ? "active" : undefined} onClick={() => setF({ ...f, mins: m })}>{m} min</button>)}</div></div>
        <label className="switch"><input type="checkbox" checked={f.ro} onChange={(e) => setF({ ...f, ro: e.target.checked })} /><i /><span>Read-only (block posting and deletes)</span></label>
      </div>
      <div className="banner warn ap-mt"><Eye /><div><b>The company will see a banner</b><p>Every user at {tenant.displayName} sees who is signed in and why, for the whole session, and the session appears in their support-access history.</p></div></div>
      <div className="ap-imp-preview"><small>What the company sees</small>
        <div className="ap-imp-ban"><VenetianMask /><span><b>Accountex support ({staffName})</b> is viewing this workspace as <b>{who?.fullName ?? "…"}</b> · {f.ro ? "read-only" : "full access"} · ends in <b>{f.mins}</b> min</span><u>End session</u></div>
      </div>
    </Modal>
  );
}
