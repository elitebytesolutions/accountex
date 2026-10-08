"use client";

import { DatabaseBackup, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { listBackups, runBackup } from "../api";
import { fmtBytes, fmtDateTime, fmtDuration, useLoad } from "./config-ui";

const STATUS: Record<string, [string, string]> = { RUNNING: ["info", "Running"], COMPLETED: ["good", "Completed"], FAILED: ["danger", "Failed"] };
const VERIFIED: Record<string, [string, string]> = { NONE: ["neutral", "—"], CHECKSUM_OK: ["good", "Checksum OK"], RESTORE_TESTED: ["good", "Restore-tested"] };
const TYPE: Record<string, string> = { FULL: "Full", WAL: "WAL", TENANT_EXPORT: "Tenant export" };

/**
 * Super Admin › System › System Health (template admin/system, 30-entry-admin.html:915): Phase 38 builds only the Backups
 * panel. "Back up now" runs pg_dump into BACKUP_DIR; the row turns COMPLETED (size, duration) or FAILED.
 */
export function SystemBackupsScreen() {
  const toast = useToast();
  const { data, error, reload } = useLoad(listBackups, "Could not load backups");
  const [busy, setBusy] = useState(false);
  const running = data?.some((b) => b.status === "RUNNING") ?? false;

  // While a backup runs, poll every 3 s until it finishes.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  const run = async () => {
    setBusy(true);
    try {
      const b = await runBackup();
      toast(`Backup ${b.code} started`, { tone: "info" });
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not start the backup"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead eyebrow="System / Health" title="System health" description="Live status of Accountex Cloud services, queues and backups."
        actions={<button type="button" className="btn secondary" onClick={reload}><RefreshCw />Refresh</button>} />
      <div className="panel flush">
        <div className="panel-head"><div><h3>Backups</h3><p>On-demand full backups (pg_dump, custom format) · retained 35 days · stored in BACKUP_DIR on the server</p></div>
          <div className="panel-actions"><button type="button" className="btn secondary sm" disabled={busy || running} onClick={run}><DatabaseBackup />{running ? "Backing up…" : "Back up now"}</button></div></div>
        {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !data ? <Skeleton style={{ height: 120 }} /> : data.length === 0 ? (
          <EmptyState icon={<DatabaseBackup />} title="No backups yet" description="Run the first backup with Back up now." />
        ) : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Backup</th><th>Type</th><th>Started</th><th>Duration</th><th className="num">Size</th><th>Location</th><th>Verified</th><th>Status</th></tr></thead>
            <tbody>
              {data.map((b) => {
                const [st, sl] = STATUS[b.status] ?? ["neutral", b.status];
                const [vt, vl] = VERIFIED[b.verification] ?? ["neutral", b.verification];
                return (
                  <tr key={b.id}>
                    <td><b>{b.code}</b>{b.requestedBy && <small>by {b.requestedBy}</small>}</td>
                    <td>{TYPE[b.backupType] ?? b.backupType}</td>
                    <td>{fmtDateTime(b.startedAt)}</td>
                    <td>{b.status === "RUNNING" ? "…" : fmtDuration(b.durationSeconds)}</td>
                    <td className={b.sizeBytes === null ? "num zero" : "num"}>{fmtBytes(b.sizeBytes)}</td>
                    <td><span className="ap-ellip" title={b.location}>{b.location.split(/[\\/]/).slice(-2).join("/")}</span></td>
                    <td><span className={`badge ${vt}`}>{vl}</span></td>
                    <td><span className={`badge ${st} dot`} title={b.failureMessage ?? undefined}>{sl}{b.status === "FAILED" && b.failureMessage ? ` · ${b.failureMessage.slice(0, 60)}` : ""}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
