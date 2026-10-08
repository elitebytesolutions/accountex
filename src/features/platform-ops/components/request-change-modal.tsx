"use client";

import { GitPullRequest, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FlagEnvironment } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { TypeBadge } from "@/features/platform-flags/components/flag-ui";
import { createChangeRequest, type ChangeRequestChange } from "../api";

/**
 * Template changeRequestModal() (9J-flags.js 412–443): a Production change is submitted for approval with a reason
 * and an optional "apply automatically once approved, but not before" time (PKT). The diff is computed by the server
 * and shown on the request.
 */
export function RequestChangeModal({ flag, env, change, summary, onClose, onDone }: {
  flag: { id: string; key: string; name: string; flagType: string };
  env: FlagEnvironment;
  change: ChangeRequestChange;
  summary: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [later, setLater] = useState(false);
  const [time, setTime] = useState("22:00");
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) { setInvalid(true); toast("Give the reason for the change", { tone: "warn" }); return; }
    setBusy(true);
    try {
      let applyNotBefore: string | null = null;
      if (later) {
        const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
        let at = new Date(`${today}T${time}:00+05:00`);
        if (at.getTime() <= Date.now()) at = new Date(at.getTime() + 86_400_000);
        applyNotBefore = at.toISOString();
      }
      const cr = await createChangeRequest({ flagId: flag.id, environment: env, reason: reason.trim(), applyNotBefore, change });
      toast(`${cr.docNo} sent for approval`, { tone: "info", ms: 6000, action: { label: "View request", onClick: () => router.push(`/admin/change-requests?open=${cr.id}`) } });
      onDone();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not submit the change request"), { tone: "danger", ms: 6000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title="Request a Production change"
      subtitle={`Production is protected. A second admin must approve before ${flag.key} changes.`}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={submit}><Send />{busy ? "Submitting…" : "Submit for approval"}</button></>}>
      <div className="ff-cr-modal">
        <div className="ff-cr-sum"><span className="icon-tile orange"><GitPullRequest /></span><div><b>{summary}</b><small>{flag.name} · Production</small></div><TypeBadge type={flag.flagType} sm /></div>
        <label className="field"><span>Reason for the change *</span>
          <textarea rows={3} className={cn(invalid && "ff-invalid")} placeholder="Why now, what you checked, and how to roll back" value={reason} onChange={(e) => { setReason(e.target.value); setInvalid(false); }} /></label>
        <p className="small muted">Every other active platform admin is asked to approve. While you are the only one, you can approve it yourself by typing the flag key and a note (recorded as a solo approval).</p>
        <label className="ff-check"><input type="checkbox" checked={later} onChange={(e) => setLater(e.target.checked)} /> Apply automatically once approved, but not before <input type="time" value={time} className="ff-time" onChange={(e) => setTime(e.target.value)} /> PKT</label>
      </div>
    </Modal>
  );
}
