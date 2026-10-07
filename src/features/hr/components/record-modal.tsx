"use client";

import { History, Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { HistoryTab } from "@/features/history/components/history-tab";

/**
 * The template's add / edit modal (hrc-add-*) for one HR record, with what the template leaves out: History, activate /
 * deactivate and delete (asked for confirmation). The caller owns the form and its save.
 */
export function RecordModal({ open, onClose, title, subtitle, wide, xl, history, active, canSave, canToggle, canDelete, busy, saveLabel, onSave, onToggle, onDelete, deleteNote, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  wide?: boolean;
  xl?: boolean;
  /** Shown for an existing record. */
  history?: { schema: string; table: string; id: string } | null;
  active?: boolean;
  canSave: boolean;
  canToggle?: boolean;
  canDelete?: boolean;
  busy?: boolean;
  saveLabel: string;
  onSave: () => void;
  onToggle?: () => void;
  onDelete?: () => Promise<void> | void;
  deleteNote?: string;
  children: ReactNode;
}) {
  const [tab, setTab] = useState<"form" | "history">("form");
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} wide={wide} xl={xl}
        foot={tab === "history" ? <button type="button" className="btn secondary" onClick={() => setTab("form")}><Pencil />Back to details</button> : (
          <>
            {history && <button type="button" className="btn ghost" onClick={() => setTab("history")}><History />History</button>}
            {history && canDelete && onDelete && <button type="button" className="btn ghost" onClick={() => setConfirm(true)}><Trash2 />Delete</button>}
            <span className="spacer" />
            {history && canToggle && onToggle && <button type="button" className="btn secondary" disabled={busy} onClick={onToggle}>{active ? <><PowerOff />Deactivate</> : <><Power />Activate</>}</button>}
            <button type="button" className="btn secondary" onClick={onClose}>{canSave ? "Cancel" : "Close"}</button>
            {canSave && <button type="button" className="btn primary" disabled={busy} onClick={onSave}>{busy ? "Saving…" : saveLabel}</button>}
          </>
        )}>
        {tab === "history" && history ? <HistoryTab schema={history.schema} table={history.table} id={history.id} /> : children}
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Delete ${title.replace(/^Edit /, "")}?`} confirmLabel="Delete" danger busy={busy}
        onConfirm={async () => { setConfirm(false); await onDelete?.(); }}>{deleteNote ?? "Only records nothing uses can be deleted; otherwise deactivate."}</ConfirmDialog>
    </>
  );
}
