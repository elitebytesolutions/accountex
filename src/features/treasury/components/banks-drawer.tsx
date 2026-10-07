"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Bank } from "@/shared";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Drawer, Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { createBank, deleteBank, setBankActive } from "../api";
import { apiFieldErrors, apiMessage } from "./treasury-ui";

type Form = { code: string; name: string; shortName: string; swiftBic: string; ibanBankCode: string; isIslamic: boolean };
const blank: Form = { code: "", name: "", shortName: "", swiftBic: "", ibanBankCode: "", isIslamic: false };

/** "Add bank" modal (no template; uses the template's modal and form grid). Used inline from the bank account form and from the Banks drawer. */
export function AddBankModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (b: Bank) => void }) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      const b = await createBank({ ...form, shortName: form.shortName || null, swiftBic: form.swiftBic || null, ibanBankCode: form.ibanBankCode || null });
      toast(`${b.name} added`, { tone: "good" });
      setForm(blank);
      onSaved(b);
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not add the bank"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add bank" subtitle="Banks your company holds accounts with" foot={
      <>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Add bank"}</button>
      </>
    }>
      <FormGrid>
        <Field label="Bank name" required full error={errs.name}><input value={form.name} autoFocus placeholder="e.g. Habib Bank Limited" onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Code" required error={errs.code} hint="Short unique code, e.g. HBL"><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Short name" error={errs.shortName}><input value={form.shortName} placeholder="e.g. HBL" onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
        <Field label="SWIFT / BIC" error={errs.swiftBic}><input value={form.swiftBic} placeholder="e.g. HABBPKKA" onChange={(e) => setForm({ ...form, swiftBic: e.target.value.toUpperCase() })} /></Field>
        <Field label="IBAN bank code" error={errs.ibanBankCode}><input value={form.ibanBankCode} placeholder="e.g. HABB" maxLength={4} onChange={(e) => setForm({ ...form, ibanBankCode: e.target.value.toUpperCase() })} /></Field>
        <Check label="Islamic bank" full checked={form.isIslamic} onChange={(e) => setForm({ ...form, isIslamic: e.target.checked })} />
      </FormGrid>
    </Modal>
  );
}

/** Banks list (no template): activate / deactivate, delete unused, add. */
export function BanksDrawer({ open, onClose, banks, can, onChanged }: { open: boolean; onClose: () => void; banks: Bank[]; can: { create: boolean; edit: boolean; remove: boolean }; onChanged: () => void }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast(label, { tone: "good" });
      onChanged();
    } catch (e) {
      toast(apiMessage(e, "Could not update the bank"), { tone: "danger" });
    }
  };
  return (
    <>
      <Drawer open={open} onClose={onClose} wide title="Banks" subtitle={`${banks.length} banks · common Pakistani banks are listed for every company`} foot={can.create && <button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus />Add bank</button>}>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Bank</th><th>SWIFT</th><th>IBAN code</th><th className="num">Accounts</th><th>Active</th><th /></tr></thead>
            <tbody>
              {banks.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b><small>{b.code}{b.isIslamic ? " · Islamic" : ""}</small></td>
                  <td>{b.swiftBic ?? "—"}</td>
                  <td>{b.ibanBankCode ?? "—"}</td>
                  <td className="num">{b.accountCount || "—"}</td>
                  <td><label className="switch"><input type="checkbox" checked={b.isActive} disabled={!can.edit} aria-label={`${b.name} active`} onChange={() => run(`${b.name} ${b.isActive ? "deactivated" : "activated"}`, () => setBankActive(b.id, !b.isActive, b.rowVersion))} /><i /></label></td>
                  <td className="actions">{can.remove && b.accountCount === 0 && <button type="button" className="icon-btn-sm" aria-label={`Delete ${b.name}`} onClick={() => run(`${b.name} deleted`, () => deleteBank(b.id, b.rowVersion))}><Trash2 /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Drawer>
      <AddBankModal open={adding} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); }} />
    </>
  );
}
