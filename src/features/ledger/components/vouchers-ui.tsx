"use client";

import { AlertTriangle, Scale, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import { REVERSAL_REASONS, type GlOptions } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { ApiError } from "@/lib/api/errors";
import { dateLabel, isoDay, Money } from "@/features/finance/components/finance-ui";

/** Template voucher type badges (register: JV violet, CRV good, BRV info, BPV warn, CPV danger, Contra neutral). */
export const TYPE_UI: Record<string, { tone: Tone; label: string; name: string }> = {
  JV: { tone: "violet", label: "JV", name: "Journal voucher" },
  CRV: { tone: "good", label: "CRV", name: "Cash receipt voucher" },
  BRV: { tone: "info", label: "BRV", name: "Bank receipt voucher" },
  BPV: { tone: "warn", label: "BPV", name: "Bank payment voucher" },
  CPV: { tone: "danger", label: "CPV", name: "Cash payment voucher" },
  CON: { tone: "neutral", label: "Contra", name: "Contra voucher" },
  OB: { tone: "dark", label: "OB", name: "Opening balance voucher" },
  SYSTEM: { tone: "outline", label: "System", name: "System voucher" },
};
export const typeUi = (t: string) => TYPE_UI[t] ?? { tone: "neutral" as Tone, label: t, name: t };

export const STATUS_UI: Record<string, { tone: Tone; label: string; long: string }> = {
  DRAFT: { tone: "neutral", label: "Draft", long: "Draft" },
  PENDING_APPROVAL: { tone: "warn", label: "Pending", long: "Pending approval" },
  POSTED: { tone: "good", label: "Posted", long: "Posted" },
  REVERSED: { tone: "danger", label: "Reversed", long: "Reversed" },
};
export const StatusBadge = ({ status, long }: { status: string; long?: boolean }) => {
  const s = STATUS_UI[status] ?? { tone: "neutral" as Tone, label: status, long: status };
  return <Badge tone={s.tone} dot>{long ? s.long : s.label}</Badge>;
};

export const REASON_LABEL: Record<string, string> = {
  INCORRECT_AMOUNT: "Incorrect amount", WRONG_ACCOUNT: "Wrong account", DUPLICATE: "Duplicate entry", WRONG_PERIOD: "Wrong period", OTHER: "Other",
};

export const initials = (name: string | null | undefined) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/** "01 Oct 2026 08:42". */
export function stampLabel(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${dateLabel(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Number without "Rs" and with two decimals, for table cells (template `14,620,000.00`). */
export const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function periodLabel(options: GlOptions | null, date: string) {
  const p = options?.periods.find((x) => x.startDate <= date && x.endDate >= date);
  return p ? `${p.code} · ${p.status.toLowerCase()}` : "No open period for this date";
}

export type ActTarget = { id: string; docNo: string; voucherType: string; status: string; postingDate: string; totalDebit: number; lineCount: number; rowVersion: number };

/**
 * Template `#po-vch-act` (post / reverse a voucher). Posting a draft may move its posting date; a reversal is dated on or
 * after the voucher and posted at once.
 */
export function VoucherActModal({ mode, target, options, onClose, onPost, onReverse }: {
  mode: "post" | "reverse";
  target: ActTarget;
  options: GlOptions | null;
  onClose: () => void;
  onPost: (postingDate: string) => Promise<void>;
  onReverse: (body: { reversalDate: string; reason: string; remarks: string | null }) => Promise<void>;
}) {
  const today = isoDay(new Date());
  const [date, setDate] = useState(mode === "post" ? target.postingDate : today < target.postingDate ? target.postingDate : today);
  const [reason, setReason] = useState<string>("INCORRECT_AMOUNT");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const post = mode === "post";
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      if (post) await onPost(date);
      else await onReverse({ reversalDate: date, reason, remarks: remarks.trim() || null });
    } catch (e) {
      setError(errMsg(e, post ? "Could not post the voucher" : "Could not reverse the voucher"));
    } finally {
      setBusy(false);
    }
  };
  const next = options?.nextNumbers[target.voucherType];
  return (
    <Modal
      open
      onClose={onClose}
      title={`${post ? "Post" : "Reverse"} ${target.docNo}`}
      subtitle={post ? "Posting writes the voucher to the general ledger and locks it for editing." : "Creates a mirror voucher that swaps debits and credits. Both stay in the register."}
      foot={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {post
            ? <Button variant="primary" icon={<Send />} disabled={busy} onClick={go}>{busy ? "Posting…" : "Post voucher"}</Button>
            : <Button variant="danger" icon={<Undo2 />} disabled={busy} onClick={go}>{busy ? "Reversing…" : "Reverse voucher"}</Button>}
        </>
      }
    >
      <FormGrid>
        <Field label={post ? "Posting date" : "Reversal date"} required={!post}>
          <Input type="date" value={date} min={post ? undefined : target.postingDate} disabled={post && target.status !== "DRAFT"} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {post ? (
          <Field label="Period"><Input value={periodLabel(options, date)} disabled /></Field>
        ) : (
          <Field label="Reversal voucher no."><Input value={next ? `${next} (auto)` : "Assigned on posting"} disabled /></Field>
        )}
        {!post && (
          <Field label="Reason" required full>
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {REVERSAL_REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </Select>
          </Field>
        )}
        {!post && (
          <Field label="Remarks" full>
            <Textarea rows={2} value={remarks} maxLength={300} placeholder="Optional note for the audit trail" onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        )}
      </FormGrid>
      {post ? (
        <div className="banner info mt"><Scale /><div><b>Debits equal credits</b><p><Money value={target.totalDebit} /> across {target.lineCount} lines · {periodLabel(options, date)}.</p></div></div>
      ) : (
        <div className="banner warn mt"><AlertTriangle /><div><b>This cannot be undone</b><p>The reversal is posted on {dateLabel(date)} and linked to the original voucher.</p></div></div>
      )}
      {error && <div className="banner danger mt"><AlertTriangle /><div><b>{post ? "Not posted" : "Not reversed"}</b><p>{error}</p></div></div>}
    </Modal>
  );
}
