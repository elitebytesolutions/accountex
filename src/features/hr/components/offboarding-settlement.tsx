"use client";

import { UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { settlementOfOffboarding, startSettlement } from "@/features/payroll/settlement-api";
import { apiMessage } from "@/features/treasury/components/treasury-ui";

const LABEL: Record<string, string> = { DRAFT: "draft", PENDING_APPROVAL: "pending approval", APPROVED: "approved", PAID: "paid" };

/**
 * Offboarding drawer: "Start settlement" (creates and calculates the full & final settlement of the exit) or a link to
 * it. Completing the exit needs it approved. Hidden without final settlement access (fs:view).
 */
export function OffboardingSettlementButton({ offboardingId, canCreate, isOpen, onStatus }: { offboardingId: string; canCreate: boolean; isOpen: boolean; onStatus?: (status: string | null) => void }) {
  const toast = useToast();
  const router = useRouter();
  const [s, setS] = useState<{ id: string; docNo: string; status: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    settlementOfOffboarding(offboardingId).then((r) => { if (!cancelled) { setS(r.settlement); onStatus?.(r.settlement?.status ?? null); } }).catch(() => !cancelled && setS(null));
    return () => { cancelled = true; };
  }, [offboardingId, onStatus]);
  if (s === undefined) return null;
  if (s) return <Link className="btn secondary" href={`/hr/settlements/${s.id}`} title={`${s.docNo} · ${LABEL[s.status] ?? s.status}`}><UserX />{s.docNo} · {LABEL[s.status] ?? s.status}</Link>;
  if (!canCreate || !isOpen) return null;
  return (
    <button className="btn secondary" type="button" disabled={busy} onClick={async () => {
      setBusy(true);
      try { const r = await startSettlement(offboardingId); toast(`Settlement ${r.docNo} started`, { tone: "good" }); router.push(`/hr/settlements/${r.id}`); }
      catch (e) { toast(apiMessage(e, "Could not start the settlement"), { tone: "danger" }); setBusy(false); }
    }}><UserX />Start settlement</button>
  );
}
