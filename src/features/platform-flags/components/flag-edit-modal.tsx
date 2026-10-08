"use client";

import { useState } from "react";
import type { FlagDetail, FlagOptions } from "@/shared";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { updateFlag } from "../api";
import { CATEGORIES, FLAG_TYPE_INFO } from "./flag-ui";

const HISTORY_LABELS = { FlagEnvironments: "Environment", FlagVariations: "Variation", FlagRules: "Rule", FlagTargets: "Target", FlagPrerequisites: "Prerequisite", FlagDefaultRules: "Default rule" };

/**
 * "Edit details" of a flag (About panel fields; template-style form, the template edits only targeting) with the
 * flag's History tab (platform log of the flag and its per-environment rows). The key is read-only.
 */
export function FlagEditModal({ flag, options, onClose, onSaved }: { flag: FlagDetail; options: FlagOptions | null; onClose: () => void; onSaved: (f: FlagDetail) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: flag.name, description: flag.description ?? "", category: flag.category, secondaryType: flag.secondaryType ?? "", tags: flag.tags.join(", "),
    ownerStaffId: flag.ownerStaffId, isTemporary: flag.isTemporary, expiresOn: flag.expiresOn ?? "", staleReason: flag.staleReason ?? "",
    variations: flag.variations.map((v) => ({ name: v.name, value: v.value })),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const bool = flag.variationKind === "BOOLEAN";

  const save = async () => {
    setBusy(true);
    try {
      const saved = await updateFlag(flag.id, {
        rowVersion: flag.rowVersion, name: f.name, description: f.description, category: f.category, secondaryType: f.secondaryType || null,
        tags: f.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), ownerStaffId: f.ownerStaffId, isTemporary: f.isTemporary,
        expiresOn: f.isTemporary ? f.expiresOn : null, staleReason: f.staleReason, variations: f.variations,
      });
      toast("Flag details saved", { tone: "good" });
      onSaved(saved);
    } catch (e) {
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the flag"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminRecordModal open onClose={onClose} title={`Edit ${flag.key}`} subtitle="The key can’t change once a flag exists." wide busy={busy} saveLabel="Save details" onSave={save}
      history={{ table: "FeatureFlags", id: flag.id }} historyLabels={HISTORY_LABELS}>
      <div className="form-grid">
        <label className="full"><span>Name *</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!errors.name} />{errors.name && <small className="hint text-danger">{errors.name}</small>}</label>
        <label><span>Key</span><input value={flag.key} readOnly className="ff-mono-in" /></label>
        <label><span>Category</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select></label>
        <label><span>Secondary type</span>
          <select value={f.secondaryType} onChange={(e) => setF({ ...f, secondaryType: e.target.value })} aria-invalid={!!errors.secondaryType}>
            <option value="">None</option>{Object.entries(FLAG_TYPE_INFO).filter(([k]) => k !== flag.flagType).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
          {errors.secondaryType && <small className="hint text-danger">{errors.secondaryType}</small>}
        </label>
        <label><span>Owner</span><select value={f.ownerStaffId} onChange={(e) => setF({ ...f, ownerStaffId: e.target.value })}>{(options?.staff ?? [{ id: flag.ownerStaffId, name: flag.ownerName ?? "Owner" }]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="full"><span>Description</span><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className="full"><span>Tags</span><input value={f.tags} placeholder="comma separated" onChange={(e) => setF({ ...f, tags: e.target.value })} aria-invalid={!!errors.tags} />{errors.tags && <small className="hint text-danger">{errors.tags}</small>}</label>
        <label className="check"><input type="checkbox" checked={f.isTemporary} onChange={(e) => setF({ ...f, isTemporary: e.target.checked })} /> Temporary flag</label>
        <label><span>Expiry date {f.isTemporary ? "*" : ""}</span><input type="date" value={f.expiresOn} disabled={!f.isTemporary} onChange={(e) => setF({ ...f, expiresOn: e.target.value })} aria-invalid={!!errors.expiresOn} />{errors.expiresOn && <small className="hint text-danger">{errors.expiresOn}</small>}</label>
        <label className="full"><span>Stale note</span><input value={f.staleReason} placeholder="e.g. At 100% in Production for 60 days. Remove it from code." onChange={(e) => setF({ ...f, staleReason: e.target.value })} /></label>
        <div className="full">
          <span className="ap-lbl">Variations {bool ? "(boolean: names only)" : ""}</span>
          <div className="ff-varlist">
            {f.variations.map((v, i) => (
              <div key={i} className="ff-varrow"><span className={`ff-vsw v${i % 4}`} />
                <input value={v.name} aria-label="Variation name" onChange={(e) => setF({ ...f, variations: f.variations.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                <input value={v.value} readOnly={bool} className="ff-mono-in" aria-label="Variation value" onChange={(e) => setF({ ...f, variations: f.variations.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
              </div>
            ))}
          </div>
          {!bool && f.variations.length < 20 && <button type="button" className="ff-addrule" onClick={() => setF({ ...f, variations: [...f.variations, { name: `Variant ${f.variations.length}`, value: `variant_${f.variations.length}` }] })}>Add variation</button>}
          {errors.variations && <small className="hint text-danger">{errors.variations}</small>}
        </div>
      </div>
    </AdminRecordModal>
  );
}
