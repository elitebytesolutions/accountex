"use client";

import { useEffect, useState } from "react";
import type { ImpersonationSession } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/states";
import { listSupportAccess } from "../api";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
/** "Name <email>" → name with the e-mail on a second line (keeps the table narrow). */
const who = (label: string) => { const m = /^(.*?)\s*<([^>]+)>$/.exec(label); return m ? <>{m[1]}<small>{m[2]}</small></> : label; };
/** "Name · email" → bold name with the e-mail on a second line. */
const staffCell = (staff: string | null) => { if (!staff) return <b>Accountex support</b>; const [name, ...rest] = staff.split(" · "); return <><b>{name}</b>{rest.length > 0 && <small>{rest.join(" · ")}</small>}</>; };
const END_REASON: Record<string, string> = { MANUAL: "Ended", EXPIRED: "Timed out", REVOKED: "Revoked" };

/**
 * Account & Security › Support access (Phase 40): every time the Accountex Super Admin signed in to this company
 * through a support session, as whom, why, for how long and whether it could change data. Company-wide, so it needs
 * aud:view; without it (or on any error) the panel is not shown.
 */
export function SupportAccessHistory() {
  const [rows, setRows] = useState<ImpersonationSession[] | null | "hidden">(null);

  useEffect(() => {
    let cancelled = false;
    listSupportAccess().then((r) => !cancelled && setRows(r)).catch(() => !cancelled && setRows("hidden"));
    return () => { cancelled = true; };
  }, []);

  if (rows === "hidden") return null;
  return (
    <Panel flush title="Support access" description="When Accountex support signed in to this company, as whom and why" className="mt">
      {!rows ? <div style={{ padding: 16 }}><Skeleton style={{ height: 60 }} /></div> : rows.length === 0 ? (
        <p className="small muted" style={{ padding: 16 }}>Accountex support has never signed in to this company.</p>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Support staff</th><th>Signed in as</th><th>Reason</th><th>Access</th><th>Started</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{staffCell(s.staff)}</td>
                  <td>{who(s.targetUserLabel)}</td>
                  <td>{s.reason}</td>
                  <td><Badge tone={s.isReadOnly ? "neutral" : "warn"}>{s.isReadOnly ? "Read-only" : "Full access"}</Badge><small>{s.timeLimitMinutes} min</small></td>
                  <td>{when(s.startedAt)}</td>
                  <td>{s.live ? <Badge tone="danger" dot>Live</Badge> : <><Badge>{END_REASON[s.endReason ?? ""] ?? "Ended"}</Badge><small>{when(s.endedAt ?? s.expiresAt)}</small></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
