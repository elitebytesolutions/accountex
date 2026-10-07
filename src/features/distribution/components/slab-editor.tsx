"use client";

import { ArrowLeft, CircleCheck, History, Plus, Save, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { slabsContiguous, type CommissionPeriod, type CommissionSlabsResult } from "@/shared/distribution";
import { Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { saveCommissionSlabs } from "../api";

type Band = { id?: string; label: string; fromPct: string; toPct: string; ratePct: string };
const today = () => new Date().toISOString().slice(0, 10);
/** The template's four bands, offered when a company has none yet. */
const STARTER: Band[] = [
  { label: "Below 80%", fromPct: "0", toPct: "80", ratePct: "0.5" }, { label: "80–100%", fromPct: "80", toPct: "100", ratePct: "1" },
  { label: "100–120%", fromPct: "100", toPct: "120", ratePct: "1.5" }, { label: "120%+", fromPct: "120", toPct: "", ratePct: "2" },
];
const toBands = (p: CommissionPeriod): Band[] => p.bands.map((b) => ({ id: b.id, label: b.label, fromPct: String(b.fromPct), toPct: b.toPct === null ? "" : String(b.toPct), ratePct: String(b.ratePct) }));
export const periodLabel = (p: { effectiveFrom: string; effectiveTo: string | null }) => `From ${p.effectiveFrom}${p.effectiveTo ? ` to ${p.effectiveTo}` : " (open)"}`;

/** Commission band editor (template style: the template's slab table is read-only). Replaces the bands of one effective period. */
export function SlabEditor({ data, onClose, onSaved }: { data: CommissionSlabsResult; onClose: () => void; onSaved: (r: CommissionSlabsResult) => void }) {
  const toast = useToast();
  const startPeriod = data.periods.find((p) => p.effectiveFrom === data.current) ?? data.periods[0] ?? null;
  const [sel, setSel] = useState<string>(startPeriod?.effectiveFrom ?? "new");
  const [from, setFrom] = useState(startPeriod?.effectiveFrom ?? today());
  const [to, setTo] = useState(startPeriod?.effectiveTo ?? "");
  const [bands, setBands] = useState<Band[]>(startPeriod ? toBands(startPeriod) : STARTER);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<Band | null>(null);

  const pick = (key: string) => {
    setSel(key);
    setErrs({});
    const p = data.periods.find((x) => x.effectiveFrom === key);
    if (p) { setFrom(p.effectiveFrom); setTo(p.effectiveTo ?? ""); setBands(toBands(p)); return; }
    setFrom(today()); setTo("");
    setBands(startPeriod ? toBands(startPeriod).map((b) => ({ ...b, id: undefined })) : STARTER);
  };
  const problem = useMemo(() => {
    if (bands.some((b) => b.fromPct === "" || isNaN(Number(b.fromPct)) || (b.toPct !== "" && isNaN(Number(b.toPct))))) return "Fill in every band's from and to";
    return slabsContiguous(bands.map((b) => ({ fromPct: Number(b.fromPct), toPct: b.toPct === "" ? null : Number(b.toPct) })));
  }, [bands]);
  const setBand = (i: number, k: keyof Band, v: string) => setBands((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)));
  const add = () => setBands((bs) => {
    const last = bs[bs.length - 1];
    const start = last ? (last.toPct || String(Number(last.fromPct) + 20)) : "0";
    const fixed = last && !last.toPct ? bs.map((b, j) => (j === bs.length - 1 ? { ...b, toPct: start } : b)) : bs;
    return [...fixed, { label: `${start}%+`, fromPct: start, toPct: "", ratePct: "" }];
  });
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      const r = await saveCommissionSlabs({
        replaceFrom: sel === "new" ? null : sel, effectiveFrom: from, effectiveTo: to || null,
        bands: bands.map((b) => ({ label: b.label, fromPct: b.fromPct, toPct: b.toPct === "" ? null : b.toPct, ratePct: b.ratePct })),
      });
      toast(`Commission bands saved · ${periodLabel({ effectiveFrom: from, effectiveTo: to || null })}`, { tone: "good" });
      onSaved(r);
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the bands"), { tone: "danger" }); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} wide title={hist ? `${hist.label} · history` : "Commission bands"} subtitle={hist ? undefined : "Paid on achieved sales, by target achievement band. Bands start at 0% and follow on without gaps."}
      foot={hist ? <button type="button" className="btn secondary" onClick={() => setHist(null)}><ArrowLeft />Back to bands</button> : (
        <><span className="spacer" /><button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={busy || !!problem} onClick={save}><Save />{busy ? "Saving…" : "Save bands"}</button></>
      )}>
      {hist?.id ? <HistoryTab schema="Distribution" table="CommissionSlabs" id={hist.id} /> : (
        <>
          <FormGrid cols={3}>
            <Field label="Period">
              <select value={sel} onChange={(e) => pick(e.target.value)}>
                {data.periods.map((p) => <option key={p.effectiveFrom} value={p.effectiveFrom}>{periodLabel(p)}{p.effectiveFrom === data.current ? " · in force" : ""}</option>)}
                <option value="new">New period…</option>
              </select>
            </Field>
            <Field label="Effective from" required error={errs.effectiveFrom}><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="Effective to" error={errs.effectiveTo} hint="Leave blank while in force"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </FormGrid>
          <div className="ds-bands">
            {bands.map((b, i) => (
              <div className="ds-band" key={i} style={{ ["--i" as string]: i }}>
                <label>Achievement band<input value={b.label} maxLength={40} onChange={(e) => setBand(i, "label", e.target.value)} /></label>
                <label>From %<input inputMode="decimal" value={b.fromPct} onChange={(e) => setBand(i, "fromPct", e.target.value)} /></label>
                <label>To %<input inputMode="decimal" value={b.toPct} placeholder="Open" onChange={(e) => setBand(i, "toPct", e.target.value)} /></label>
                <label>Rate %<input inputMode="decimal" value={b.ratePct} onChange={(e) => setBand(i, "ratePct", e.target.value)} /></label>
                <span style={{ display: "flex", gap: 2 }}>
                  {b.id && <button type="button" className="icon-btn-sm" aria-label={`History of ${b.label}`} onClick={() => setHist(b)}><History /></button>}
                  <button type="button" className="icon-btn-sm" aria-label={`Remove ${b.label}`} disabled={bands.length === 1} onClick={() => setBands((bs) => bs.filter((_, j) => j !== i))}><Trash2 /></button>
                </span>
              </div>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn secondary sm" disabled={bands.length >= 20} onClick={add}><Plus />Add band</button>
            <span className={`ds-bands-msg ${problem ? "bad" : "ok"}`} role="status" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              {problem ? <><TriangleAlert size={14} />{problem}</> : <><CircleCheck size={14} />Bands start at 0% and follow on without gaps</>}
            </span>
          </div>
          {errs.bands && <p className="hint text-danger" role="alert">{errs.bands}</p>}
        </>
      )}
    </Modal>
  );
}
