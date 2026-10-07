"use client";

import { Ban, Check as CheckIcon, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { BankAccount, ChequeBook, LookupsResponse } from "@/shared";
import { Badge, type Tone } from "@/components/ui/badge";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf } from "@/features/settings/use-lookups";
import { chequeBookAction, createChequeBook, deleteChequeBook, listChequeBooks } from "../api";
import { apiFieldErrors, apiMessage } from "./treasury-ui";

const TONE: Record<string, Tone> = { ACTIVE: "good", ON_ORDER: "info", EXHAUSTED: "neutral", CANCELLED: "danger" };
const pad = (n: number, d: number) => String(n).padStart(d, "0");
type Form = { bookRef: string; firstLeafNo: string; lastLeafNo: string; leafDigits: string; receivedOn: string; status: "ACTIVE" | "ON_ORDER"; crossedAcPayee: boolean; remarks: string };

/** Cheque books of one bank account (no template: built from the template's table, badge, progress and form styles). */
export function ChequeBooksTab({ account, lookups, can, onChanged }: { account: BankAccount; lookups: LookupsResponse; can: { create: boolean; edit: boolean; remove: boolean }; onChanged: () => void }) {
  const toast = useToast();
  const [books, setBooks] = useState<ChequeBook[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listChequeBooks(account.id).then((b) => !cancelled && setBooks(b)).catch(() => !cancelled && setBooks([]));
    return () => {
      cancelled = true;
    };
  }, [account.id, attempt]);
  const reload = () => {
    setAttempt((n) => n + 1);
    onChanged();
  };

  const start = () => {
    const last = Math.max(0, ...(books ?? []).map((b) => b.lastLeafNo));
    setForm({ bookRef: "", firstLeafNo: last ? String(last + 1) : "", lastLeafNo: last ? String(last + 50) : "", leafDigits: "8", receivedOn: new Date().toISOString().slice(0, 10), status: (books ?? []).some((b) => b.status === "ACTIVE") ? "ON_ORDER" : "ACTIVE", crossedAcPayee: true, remarks: "" });
    setErrs({});
  };
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    try {
      const b = await createChequeBook({
        bankAccountId: account.id, bookRef: form.bookRef || null, firstLeafNo: Number(form.firstLeafNo), lastLeafNo: Number(form.lastLeafNo), leafDigits: Number(form.leafDigits),
        receivedOn: form.receivedOn || null, status: form.status, crossedAcPayee: form.crossedAcPayee, remarks: form.remarks || null,
      });
      toast(`Cheque book ${b.bookRef ?? b.firstLeafNo} added · ${b.leaves} leaves`, { tone: "good" });
      setForm(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not add the cheque book"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(label, { tone: "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update the cheque book"), { tone: "danger" });
    }
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="small muted">Leaf ranges can’t overlap; one book is active at a time.</span>
        <span className="spacer" />
        {can.create && account.status === "ACTIVE" && !form && <button type="button" className="btn secondary sm" onClick={start}><Plus />Add cheque book</button>}
      </div>
      {form && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <FormGrid cols={3}>
            <Field label="Book reference" error={errs.bookRef}><input value={form.bookRef} placeholder="e.g. CQ-6650101" onChange={(e) => setForm({ ...form, bookRef: e.target.value })} /></Field>
            <Field label="First leaf" required error={errs.firstLeafNo}><input inputMode="numeric" value={form.firstLeafNo} onChange={(e) => setForm({ ...form, firstLeafNo: e.target.value })} /></Field>
            <Field label="Last leaf" required error={errs.lastLeafNo}><input inputMode="numeric" value={form.lastLeafNo} onChange={(e) => setForm({ ...form, lastLeafNo: e.target.value })} /></Field>
            <Field label="Digits printed" error={errs.leafDigits}><input inputMode="numeric" value={form.leafDigits} onChange={(e) => setForm({ ...form, leafDigits: e.target.value })} /></Field>
            <Field label="Received on" error={errs.receivedOn}><input type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} /></Field>
            <Field label="Status" error={errs.status}>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}>
                <option value="ACTIVE">Active (in use)</option>
                <option value="ON_ORDER">On order</option>
              </select>
            </Field>
            <Field label="Remarks" full><input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
            <Check label="Crossed “A/C payee only”" checked={form.crossedAcPayee} onChange={(e) => setForm({ ...form, crossedAcPayee: e.target.checked })} />
          </FormGrid>
          <div className="form-actions">
            <button type="button" className="btn secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Add cheque book"}</button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Book</th><th>Leaves</th><th>Next leaf</th><th>Used</th><th>Status</th><th /></tr></thead>
          <tbody>
            {!books && <tr><td colSpan={6}><Skeleton style={{ height: 18 }} /></td></tr>}
            {books?.map((b) => (
              <tr key={b.id}>
                <td><b>{b.bookRef ?? "—"}</b>{b.receivedOn && <small>Received {dateLabel(b.receivedOn)}</small>}</td>
                <td>{pad(b.firstLeafNo, b.leafDigits)} – {pad(b.lastLeafNo, b.leafDigits)}<small>{b.leaves} leaves{b.crossedAcPayee ? " · A/C payee" : ""}</small></td>
                <td>{b.nextLeafNo > b.lastLeafNo ? "—" : pad(b.nextLeafNo, b.leafDigits)}</td>
                <td style={{ minWidth: 110 }}>
                  <div className="row small"><span>{b.used} of {b.leaves}</span></div>
                  <div className="progress"><i style={{ width: `${Math.round((b.used / b.leaves) * 100)}%` }} /></div>
                </td>
                <td><Badge tone={TONE[b.status] ?? "neutral"} dot>{labelOf(lookups, "ChequeBookStatus", b.status)}</Badge></td>
                <td className="actions" style={{ whiteSpace: "nowrap" }}>
                  {can.edit && b.status === "ON_ORDER" && <button type="button" className="icon-btn-sm" title="Activate" aria-label="Activate cheque book" onClick={() => run(`${b.bookRef ?? "Cheque book"} activated`, () => chequeBookAction(b.id, "activate", b.rowVersion))}><CheckIcon /></button>}
                  {can.edit && (b.status === "ACTIVE" || b.status === "ON_ORDER") && <button type="button" className="icon-btn-sm" title="Cancel book" aria-label="Cancel cheque book" onClick={() => run(`${b.bookRef ?? "Cheque book"} cancelled`, () => chequeBookAction(b.id, "cancel", b.rowVersion))}><Ban /></button>}
                  {can.remove && b.used === 0 && <button type="button" className="icon-btn-sm" aria-label="Delete cheque book" onClick={() => run(`${b.bookRef ?? "Cheque book"} deleted`, () => deleteChequeBook(b.id, b.rowVersion))}><Trash2 /></button>}
                </td>
              </tr>
            ))}
            {books && !books.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>No cheque books yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
