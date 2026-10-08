"use client";

import { CornerDownRight, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { accountLevel, coaTreeErrors, nextChildCode, parentAccountCode, type CoaTemplateAccountInput, type CoaTemplateDetail } from "@/shared";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/components/ui/cn";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { updateCoaTemplate } from "../api";

type Row = CoaTemplateAccountInput & { key: string };
let seq = 0;
const keyOf = () => `n${++seq}`;
const LEVEL = ["", "Class", "Header", "Group", "Postable"];
const byCode = (a: Row, b: Row) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/**
 * Account tree editor (template-style addition replacing the template's toast-only "Edit"): add, edit, move (change the
 * code, which sets the parent) and delete rows. Level, class, parent and "postable" follow from the code; the code /
 * parent / nature rules are checked live and again by the server. Saving replaces the template's tree.
 */
export function CoaTreeEditor({ template, onClose, onSaved }: { template: CoaTemplateDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() => template.accounts.map((a) => ({
    key: keyOf(), id: a.id, code: a.code, name: a.name, nature: a.nature as "DR" | "CR", subType: a.subType, defaultRole: a.defaultRole,
  })));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverErrs, setServerErrs] = useState<Record<string, string>>({});

  const sorted = useMemo(() => [...rows].sort(byCode), [rows]);
  const errors = useMemo(() => {
    const valid = sorted.filter((r) => /^[1-5][0-9]{3}(-[0-9]{2,3})?$/.test(r.code));
    const e: Record<string, string> = {};
    sorted.forEach((r) => { if (!valid.includes(r)) e[r.key] = "Use a code like 1110 or 1110-01"; else if (r.name.trim().length < 2) e[r.key] = "Name the account"; });
    for (const [k, msg] of Object.entries(coaTreeErrors(valid))) {
      const r = valid[Number(k.split(".")[1])];
      if (r) e[r.key] ??= msg;
    }
    return e;
  }, [sorted]);
  const errCount = Object.keys(errors).length;
  const visible = q ? sorted.filter((r) => r.code.startsWith(q) || r.name.toLowerCase().includes(q.toLowerCase())) : sorted;

  const patch = (key: string, p: Partial<Row>) => { setRows((x) => x.map((r) => (r.key === key ? { ...r, ...p } : r))); setServerErrs({}); };
  const addChild = (parent: Row | null) => {
    const taken = rows.map((r) => r.code);
    const code = parent ? nextChildCode(parent.code, taken) : [1, 2, 3, 4, 5].map((c) => `${c}000`).find((c) => !taken.includes(c)) ?? null;
    if (!code) return toast(parent ? `No free code under ${parent.code}` : "All five classes exist", { tone: "warn" });
    const nature = parent?.nature ?? (["1", "5"].includes(code[0]!) ? "DR" : "CR");
    setRows((x) => [...x, { key: keyOf(), code, name: "", nature, subType: null, defaultRole: null }]);
    setQ("");
  };
  const remove = (row: Row) => {
    const under = (c: string): boolean => { const p = parentAccountCode(c); return p === row.code || (p !== null && under(p)); };
    const gone = rows.filter((r) => r.key === row.key || under(r.code));
    setRows((x) => x.filter((r) => !gone.includes(r)));
    toast(`Removed ${row.code}${gone.length > 1 ? ` and ${gone.length - 1} account${gone.length > 2 ? "s" : ""} under it` : ""}`, { tone: "info" });
  };

  const save = async () => {
    if (errCount) return toast(`Fix ${errCount} row${errCount === 1 ? "" : "s"} first`, { tone: "warn" });
    setBusy(true);
    try {
      const accounts = sorted.map((r) => ({ id: r.id, code: r.code, name: r.name.trim(), nature: r.nature, subType: r.subType || null, defaultRole: r.defaultRole || null }));
      await updateCoaTemplate(template.id, { rowVersion: template.rowVersion, accounts });
      toast(`${template.name}: ${accounts.length} accounts saved`, { tone: "good" });
      onSaved();
    } catch (e) {
      const fe = adminFieldErrors(e);
      setServerErrs(Object.fromEntries(Object.entries(fe).map(([k, v]) => [sorted[Number(k.split(".")[1])]?.key ?? k, v])));
      toast(adminErrorMessage(e, "Could not save the accounts"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open xl onClose={onClose} title={`Edit accounts — ${template.name}`} subtitle={`${rows.length} accounts · ${rows.filter((r) => r.code.includes("-")).length} postable · codes set the level and parent (X000 › XY00 › XYZW › XYZW-NN)`}
      foot={(
        <>
          <button type="button" className="btn ghost" onClick={() => addChild(null)}><Plus />Add class</button>
          <span className="spacer" />
          {errCount > 0 && <span className="badge danger">{errCount} row{errCount === 1 ? "" : "s"} to fix</span>}
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save accounts"}</button>
        </>
      )}>
      <label className="search-field mb"><Search /><input value={q} placeholder="Find by code or name…" onChange={(e) => setQ(e.target.value)} /></label>
      <div className="table-wrap" style={{ maxHeight: "58vh", overflow: "auto" }}>
        <table className="tbl" data-plain>
          <thead><tr><th style={{ width: 130 }}>Code</th><th>Name</th><th style={{ width: 80 }}>Nature</th><th style={{ width: 130 }}>Sub-type</th><th style={{ width: 170 }}>Posting role</th><th style={{ width: 90 }}>Level</th><th style={{ width: 84 }} /></tr></thead>
          <tbody>
            {visible.map((r) => {
              const level = /^[1-5][0-9]{3}(-[0-9]{2,3})?$/.test(r.code) ? accountLevel(r.code) : 0;
              const err = serverErrs[r.key] ?? errors[r.key];
              return (
                <tr key={r.key} className={cn(err && "ap-invalid")}>
                  <td style={{ paddingLeft: 8 + Math.max(0, level - 1) * 14 }}>
                    <input className="tnum" value={r.code} aria-invalid={!!err} maxLength={8} style={{ width: 96 }} onChange={(e) => patch(r.key, { code: e.target.value.replace(/[^0-9-]/g, "") })} />
                  </td>
                  <td>
                    <input value={r.name} maxLength={120} aria-invalid={!!err} placeholder="Account name" onChange={(e) => patch(r.key, { name: e.target.value })} />
                    {err && <small className="hint text-danger" role="alert">{err}</small>}
                  </td>
                  <td><select value={r.nature} onChange={(e) => patch(r.key, { nature: e.target.value as "DR" | "CR" })}><option value="DR">DR</option><option value="CR">CR</option></select></td>
                  <td><input value={r.subType ?? ""} maxLength={40} disabled={level !== 4} placeholder={level === 4 ? "e.g. BANK" : "—"} onChange={(e) => patch(r.key, { subType: e.target.value.toUpperCase() })} /></td>
                  <td><input value={r.defaultRole ?? ""} maxLength={60} disabled={level !== 4} placeholder={level === 4 ? "e.g. OUTPUT_GST" : "—"} onChange={(e) => patch(r.key, { defaultRole: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} /></td>
                  <td><span className={cn("badge", level === 4 ? "good" : "neutral")}>{LEVEL[level] ?? "?"}</span></td>
                  <td className="actions">
                    {level > 0 && level < 4 && <button type="button" className="btn ghost sm" title="Add a child account" aria-label={`Add under ${r.code}`} onClick={() => addChild(r)}><CornerDownRight /></button>}
                    <button type="button" className="btn ghost sm" title="Delete (with the accounts under it)" aria-label={`Delete ${r.code}`} onClick={() => remove(r)}><Trash2 /></button>
                  </td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={7} className="muted">{rows.length ? "No accounts match" : "No accounts yet: add a class, or import a CSV"}</td></tr>}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
