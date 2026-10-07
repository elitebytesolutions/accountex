"use client";

import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { HistoryItem } from "@/shared";
import { Skeleton, EmptyState, ErrorState } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { getHistory } from "../api";

const DOT: Record<string, string> = { INSERT: "good", UPDATE: "warn", DELETE: "danger" };
const VERB: Record<string, string> = { INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted" };
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/**
 * History tab for a record's detail page: every version, who made it and what changed (template `.timeline`).
 * Usage: <HistoryTab schema="Company" table="Branches" id={branch.id} />
 */
export function HistoryTab({ schema, table, id }: { schema: string; table: string; id: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getHistory(schema, table, id)
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
  }, [schema, table, id, attempt]);

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
        {items.map((h) => (
          <div key={h.entryId} className="tl-item">
            <span className={`tl-dot ${DOT[h.action] ?? ""}`} />
            <div>
              <b>
                {VERB[h.action] ?? h.action} by {h.actor.name ?? "Unknown"} · v{h.version}
              </b>
              <small>
                {new Date(h.occurredAt).toLocaleString()}
                {h.actor.email && ` · ${h.actor.email}`}
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
        ))}
      </div>
      {total > items.length && <p className="muted small">Showing the latest {items.length} of {total} changes.</p>}
    </>
  );
}
