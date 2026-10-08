"use client";

import { Bell, Mail, MessageCircle, MessageSquareText, RefreshCw, Send, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { COMM_LOG_LOOKUPS, COMM_LOG_RETRYABLE, type CommLogList } from "@/shared";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { ApiError } from "@/lib/api/errors";
import { listCommLogs, retryCommLog } from "../api";
import { LookupBadge } from "./growth-ui";

const CH: Record<string, [string, LucideIcon, string]> = {
  EMAIL: ["Email", Mail, "email"], SMS: ["SMS", MessageSquareText, "sms"], WHATSAPP: ["WhatsApp", MessageCircle, "wa"], IN_APP: ["In-app", Bell, "email"],
};
type Filter = "all" | "delivered" | "failed" | "queued";

/**
 * Template delivery log panel of admin/comms (9B logRow): time, template, tenant, recipient, channel pill, status,
 * Retry on queued / failed / bounced rows (a new row; the log is append-only). `reloadKey` refreshes it after a broadcast.
 */
export function DeliveryLog({ reloadKey }: { reloadKey?: unknown }) {
  const toast = useToast();
  const lookups = useAdminLookups(COMM_LOG_LOOKUPS);
  const [filter, setFilter] = useState<Filter>("all");
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<CommLogList | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    listCommLogs({ filter, hours, pageSize: 100 })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the delivery log" }));
    return () => { cancelled = true; };
  }, [filter, hours, attempt, reloadKey]);

  const retry = async (id: string, to: string) => {
    setBusy(id);
    try { const r = await retryCommLog(id); toast(r.status === "DELIVERED" ? `Re-delivered in-app to ${r.recipient}` : `Re-queued for ${to}`, { tone: "good" }); reload(); }
    catch (e) { toast(adminErrorMessage(e, "Could not resend the message"), { tone: "danger" }); }
    finally { setBusy(null); }
  };
  const chips: [Filter, string, number | undefined][] = [["all", "All", data?.counts.all], ["delivered", "Delivered", data?.counts.delivered], ["failed", "Failed", data?.counts.failed], ["queued", "Queued", data?.counts.queued]];

  return (
    <div className="panel flush">
      <div className="panel-head">
        <div><h3>Delivery log</h3><p>{hours ? `Last ${hours === 24 ? "24 hours" : `${hours / 24} days`}` : "All time"} · all channels</p></div>
        <div className="panel-actions">
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Period"><option value={24}>24 hours</option><option value={168}>7 days</option><option value={720}>30 days</option><option value={0}>All time</option></select>
          <div className="chips">{chips.map(([k, l, n]) => <button key={k} type="button" className={filter === k ? "active" : undefined} onClick={() => setFilter(k)}>{l}{n !== undefined && n > 0 && <i>{n}</i>}</button>)}</div>
        </div>
      </div>
      {error ? <ErrorState {...error} onRetry={reload} /> : !data ? <Skeleton style={{ height: 160 }} /> : !data.items.length ? (
        <EmptyState icon={<Send />} title="No messages in this period" description="Broadcasts, announcement emails and resends appear here. In-app messages are delivered now; email, SMS and WhatsApp are queued until delivery is switched on (Phase 29)." />
      ) : (
        <div className="table-wrap">
          <table className="tbl ap-logtbl">
            <thead><tr><th>Time</th><th>Template</th><th>Tenant</th><th>Recipient</th><th>Channel</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.items.map((r) => {
                const [label, Icon, cls] = CH[r.channel] ?? [r.channel, Mail, "email"];
                return (
                  <tr key={r.id} title={r.errorMessage ?? r.subject ?? undefined}>
                    <td className="tnum">{new Date(r.createdAt).toLocaleString("en-GB", hours === 24 ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{r.templateName ?? r.subject ?? (r.broadcastId ? "Broadcast" : "Message")}{r.retryOfId && <small className="muted"> · resend</small>}</td>
                    <td><b>{r.tenantName ?? "—"}</b></td>
                    <td className="ap-mono">{r.recipient}</td>
                    <td><span className={`ap-chpill ${cls}`}><Icon />{label}</span></td>
                    <td><LookupBadge lookups={lookups} type="CommunicationLogStatus" code={r.status} dot /></td>
                    <td className="actions">{COMM_LOG_RETRYABLE.includes(r.status) && !r.retried && <button type="button" className="btn secondary sm" disabled={busy === r.id} onClick={() => retry(r.id, r.recipient)}><RefreshCw />{busy === r.id ? "Retrying…" : "Retry"}</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
