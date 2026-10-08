"use client";

import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { AdminHistoryItem } from "@/shared";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { getAdminHistory } from "../api";

const DOT: Record<string, string> = { INSERT: "good", UPDATE: "warn", DELETE: "danger" };
const VERB: Record<string, string> = { INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted" };
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
/** "SubscriptionPlanFeatures" → "Subscription plan features" */
const humanize = (t: string) => t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * History tab for a Super Admin record: every version of it and of its child rows (template `.timeline`), naming the
 * Super Admin. The table must be registered in src/server/modules/platform-admin/history/admin-history-tables.ts.
 * Usage: <AdminHistoryTab table="SubscriptionPlans" id={plan.id} labels={{ SubscriptionPlanFeatures: "Feature" }} />
 * `labels` names child-table rows (default: the humanised table name); `reloadKey` refetches after a save.
 */
export function AdminHistoryTab({ table, id, labels, reloadKey }: { table: string; id: string; labels?: Record<string, string>; reloadKey?: unknown }) {
  const [items, setItems] = useState<AdminHistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdminHistory(table, id)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load history" });
      });
    return () => {
      cancelled = true;
    };
  }, [table, id, attempt, reloadKey]);

  const retry = useCallback(() => {
    setError(null);
    setItems(null);
    setAttempt((n) => n + 1);
  }, []);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={retry} />;
  if (!items) return <div className="stack"><Skeleton style={{ height: 12, width: "60%" }} /><Skeleton style={{ height: 12, width: "40%" }} /></div>;
  if (items.length === 0) return <EmptyState icon={<History />} title="No history yet" description="Changes to this record will appear here." />;

  return (
    <>
      <div className="timeline">
        {items.map((h) => {
          const child = h.table !== table;
          const what = child ? ` ${(labels?.[h.table] ?? humanize(h.table)).toLowerCase()}` : "";
          const label = child ? show(h.row?.name ?? h.row?.code ?? h.row?.moduleKey ?? h.row?.planId ?? h.recordId) : null;
          return (
            <div key={h.entryId} className="tl-item">
              <span className={`tl-dot ${DOT[h.action] ?? ""}`} />
              <div>
                <b>
                  {VERB[h.action] ?? h.action}
                  {what}
                  {label && ` (${label})`} by {h.actor.name ?? "system"} · v{h.version}
                </b>
                <small>
                  {new Date(h.occurredAt).toLocaleString()}
                  {h.ipAddress && ` · ${h.ipAddress}`}
                </small>
                {h.action === "UPDATE" && h.changes && (
                  <p>
                    {Object.entries(h.changes as Record<string, { before?: unknown; after?: unknown }>).map(([field, c]) => (
                      <span key={field} style={{ display: "block" }}>
                        <b style={{ display: "inline", fontSize: "inherit" }}>{field}</b>: {show(c.before)} → {show(c.after)}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {total > items.length && <p className="muted small">Showing the latest {items.length} of {total} changes.</p>}
    </>
  );
}
