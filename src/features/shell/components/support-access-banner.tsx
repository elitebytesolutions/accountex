"use client";

import { LogOut, VenetianMask } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ImpersonationBanner } from "@/shared";
import { currentSupportAccess, endSupportAccess } from "../api";

/**
 * Workspace banner while Accountex support is signed in through a support session (template .ap-imp-bar, 9B line
 * 479): who, read-only or not, a live countdown and "End session". Renders nothing without a session or on any error.
 */
export function SupportAccessBanner() {
  const router = useRouter();
  const [s, setS] = useState<ImpersonationBanner | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => currentSupportAccess().then((b) => !cancelled && setS(b ?? null)).catch(() => !cancelled && setS(null));
    void load();
    const poll = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(poll); };
  }, []);
  useEffect(() => {
    if (!s) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [s]);

  if (!s) return null;
  const left = Math.max(0, Math.round((Date.parse(s.expiresAt) - now) / 1000));
  const end = async () => {
    setEnding(true);
    try { await endSupportAccess(); } catch { /* the session may already be over */ }
    router.replace("/login");
    router.refresh();
  };
  return (
    <div className="ap-imp-bar" role="status">
      <span className="ap-pulse" /><VenetianMask />
      <div>
        <b>Accountex support ({s.staff}) is signed in · {s.isReadOnly ? "read-only" : "full access"} · ends in <span className="tnum">{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span></b>
        <small>{s.reason}</small>
      </div>
      <span className="spacer" />
      <button type="button" className="btn lime sm" disabled={ending} onClick={end}><LogOut />{ending ? "Ending…" : "End session"}</button>
    </div>
  );
}
