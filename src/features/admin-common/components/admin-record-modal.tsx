"use client";

import { History, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";

/**
 * Add / edit modal for a Super Admin record, with History (platform log) and an optional confirmed delete.
 * The caller owns the form and its save; `extra` adds footer buttons (e.g. Activate / Retire).
 */
export function AdminRecordModal({ open, onClose, title, subtitle, wide, history, historyLabels, busy, saveLabel, saveIcon, onSave, extra, onDelete, deleteNote, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  wide?: boolean;
  /** Shown for an existing record: a table registered in admin-history-tables.ts. */
  history?: { table: string; id: string } | null;
  historyLabels?: Record<string, string>;
  busy?: boolean;
  saveLabel: string;
  /** Icon before the save label (template footers such as "bell-plus Create rule"). */
  saveIcon?: ReactNode;
  onSave: () => void;
  extra?: ReactNode;
  onDelete?: () => Promise<void> | void;
  deleteNote?: string;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"form" | "history">("form");
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} wide={wide}
        foot={tab === "history" ? <button type="button" className="btn secondary" onClick={() => setTab("form")}><Pencil />Back to details</button> : (
          <>
            {history && <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>}
            {history && onDelete && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
            <span className="spacer" />
            {extra}
            <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={onSave}>{busy ? "Saving…" : <>{saveIcon}{saveLabel}</>}</button>
          </>
        )}>
        {tab === "history" && history ? <AdminHistoryTab table={history.table} id={history.id} labels={historyLabels} /> : children}
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${title.replace(/^Edit /, "")}?`} confirmLabel="Delete" danger busy={busy}
        onConfirm={async () => { setConfirm(false); await onDelete?.(); }}>{deleteNote ?? "Only records nothing uses can be deleted."}</ConfirmDialog>
    </>
  );
}
