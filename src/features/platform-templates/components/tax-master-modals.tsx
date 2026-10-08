"use client";

import { ArrowRight, CalendarCheck, Plus, Trash2, TriangleAlert, Undo2, Users } from "lucide-react";
import { useState } from "react";
import type { SalarySlabYear, SalesTaxRate, TaxAuthority, WithholdingRate } from "@/shared";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { cancelSalesTax, cancelWithholding, saveSalarySlabs, scheduleSalesTax, scheduleWithholding, updateSalesTax, updateWithholding } from "../api";
import { pct, today } from "./templates-ui";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
type Form = Record<string, string | boolean>;

function useForm(init: () => Form) {
  const [f, setF] = useState<Form>(init);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  return { f, s, set, errs, setErrs, busy, setBusy };
}

/**
 * Template "Change rate" modal (sales tax) and its withholding twin: schedules a new effective-dated rate that
 * supersedes the one in force the day before. `base` = the lineage's current row (null = a new rate line).
 */
export function ScheduleRateModal({ kind, base, authorities, onClose, onSaved }: {
  kind: "sales-tax" | "withholding";
  base: SalesTaxRate | WithholdingRate | null;
  authorities: TaxAuthority[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const st = base && kind === "sales-tax" ? (base as SalesTaxRate) : null;
  const wt = base && kind === "withholding" ? (base as WithholdingRate) : null;
  const { f, s, set, errs, setErrs, busy, setBusy } = useForm((): Form => kind === "sales-tax"
    ? { taxAuthorityId: st?.taxAuthorityId ?? authorities[0]?.id ?? "", appliesTo: st?.appliesTo ?? "", rate: str(st?.rate), reducedRatesNote: str(st?.reducedRatesNote), effectiveFrom: today(), legalReference: "" }
    : {
      sectionCode: wt?.sectionCode ?? "", nature: wt?.nature ?? "", atlRateCompany: str(wt?.atlRateCompany), atlRateOther: str(wt?.atlRateOther), nonAtlRateCompany: str(wt?.nonAtlRateCompany),
      nonAtlRateOther: str(wt?.nonAtlRateOther), rateNote: str(wt?.rateNote), thresholdAmount: str(wt?.thresholdAmount), thresholdNote: str(wt?.thresholdNote),
      usesSalarySlabs: wt?.usesSalarySlabs ?? false, effectiveFrom: today(), legalReference: "",
    });
  const auth = authorities.find((a) => a.id === s("taxAuthorityId"));

  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      if (kind === "sales-tax") await scheduleSalesTax(f);
      else await scheduleWithholding(f);
      toast(base ? `Change scheduled from ${s("effectiveFrom")} · publish to tenants to roll it out` : "Rate added · publish to tenants to roll it out", { tone: "good" });
      onSaved();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not schedule the rate"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const title = base ? `Change ${st ? `${st.authorityCode} rate` : wt?.sectionCode}` : kind === "sales-tax" ? "New sales tax rate" : "New withholding section";
  const sub = st ? `${st.jurisdiction} · ${st.appliesTo}` : wt ? `Income Tax Ordinance 2001 · ${wt.nature}` : "Effective-dated: it starts on the date you choose";
  return (
    <Modal open wide onClose={onClose} title={title} subtitle={sub}
      foot={<><span className="spacer" /><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><CalendarCheck />{busy ? "Scheduling…" : base ? "Schedule change" : "Add rate"}</button></>}>
      {st && <div className="ap-ratechg"><div><small>Current</small><b>{pct(st.rate)}</b></div><ArrowRight /><div><small>New</small><b>{s("rate") === "" ? "—" : `${s("rate")}%`}</b></div></div>}
      <FormGrid>
        {kind === "sales-tax" ? (
          <>
            {!base && (
              <>
                <Field label="Authority" required error={errs.taxAuthorityId}><select value={s("taxAuthorityId")} onChange={(e) => set("taxAuthorityId", e.target.value)}>{authorities.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
                <Field label="Applies to" required error={errs.appliesTo} hint={auth ? `${auth.levyScope === "SERVICES" ? "Services" : "Goods"} · e.g. Supply of goods · Sales Tax Act 1990` : undefined}><input value={s("appliesTo")} maxLength={160} onChange={(e) => set("appliesTo", e.target.value)} /></Field>
              </>
            )}
            <Field label="New rate (%)" required error={errs.rate}><input type="number" step="0.5" min={0} max={100} value={s("rate")} onChange={(e) => set("rate", e.target.value)} /></Field>
            <Field label="Effective from" required error={errs.effectiveFrom}><input type="date" min={today()} value={s("effectiveFrom")} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
            <Field label="Reduced / special rates" full error={errs.reducedRatesNote}><input value={s("reducedRatesNote")} maxLength={200} placeholder="e.g. 0% Fifth Sch. · exempt Sixth Sch." onChange={(e) => set("reducedRatesNote", e.target.value)} /></Field>
          </>
        ) : (
          <>
            {!base && <Field label="Section" required error={errs.sectionCode}><input value={s("sectionCode")} maxLength={40} placeholder="153(1)(a)" onChange={(e) => set("sectionCode", e.target.value)} /></Field>}
            <Field label="Nature" required error={errs.nature}><input value={s("nature")} maxLength={160} placeholder="Sale of goods" onChange={(e) => set("nature", e.target.value)} /></Field>
            <Field label="Effective from" required error={errs.effectiveFrom}><input type="date" min={today()} value={s("effectiveFrom")} onChange={(e) => set("effectiveFrom", e.target.value)} /></Field>
            <Check label="Uses the section 149 salary slabs" checked={Boolean(f.usesSalarySlabs)} onChange={(e) => set("usesSalarySlabs", e.target.checked)} />
            {!f.usesSalarySlabs && (
              <>
                <Field label="ATL rate · companies (%)" error={errs.atlRateCompany}><input type="number" step="0.1" min={0} max={100} value={s("atlRateCompany")} onChange={(e) => set("atlRateCompany", e.target.value)} /></Field>
                <Field label="ATL rate · others (%)" error={errs.atlRateOther}><input type="number" step="0.1" min={0} max={100} value={s("atlRateOther")} onChange={(e) => set("atlRateOther", e.target.value)} /></Field>
                <Field label="Non-ATL · companies (%)" error={errs.nonAtlRateCompany}><input type="number" step="0.1" min={0} max={100} value={s("nonAtlRateCompany")} onChange={(e) => set("nonAtlRateCompany", e.target.value)} /></Field>
                <Field label="Non-ATL · others (%)" error={errs.nonAtlRateOther}><input type="number" step="0.1" min={0} max={100} value={s("nonAtlRateOther")} onChange={(e) => set("nonAtlRateOther", e.target.value)} /></Field>
              </>
            )}
            <Field label="Rate note" error={errs.rateNote}><input value={s("rateNote")} maxLength={120} placeholder="e.g. fertiliser 0.25%" onChange={(e) => set("rateNote", e.target.value)} /></Field>
            <Field label="Threshold (Rs / year)" error={errs.thresholdAmount}><input type="number" min={0} step="any" value={s("thresholdAmount")} onChange={(e) => set("thresholdAmount", e.target.value)} /></Field>
            <Field label="Threshold note" error={errs.thresholdNote}><input value={s("thresholdNote")} maxLength={120} placeholder="per supplier" onChange={(e) => set("thresholdNote", e.target.value)} /></Field>
          </>
        )}
        <Field label="Legal reference" required full error={errs.legalReference}><input value={s("legalReference")} maxLength={200} placeholder="e.g. SRO 1250(I)/2026 or Finance (Supplementary) Act" onChange={(e) => set("legalReference", e.target.value)} /></Field>
      </FormGrid>
      <div className="banner warn mt"><Users /><div><b>Tenants get it when you publish</b><p>The rate in force is closed the day before the new date. Companies import published rates into their tax codes; invoices switch on the effective date.</p></div></div>
    </Modal>
  );
}

/** A scheduled change that is not published yet: edit it, or cancel it (the previous rate is open again). */
export function ScheduledRateModal({ kind, row, onClose, onSaved }: {
  kind: "sales-tax" | "withholding";
  row: SalesTaxRate | WithholdingRate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const st = kind === "sales-tax" ? (row as SalesTaxRate) : null;
  const wt = kind === "withholding" ? (row as WithholdingRate) : null;
  const { f, s, set, errs, setErrs, busy, setBusy } = useForm((): Form => st
    ? { rate: str(st.rate), reducedRatesNote: str(st.reducedRatesNote), legalReference: str(st.legalReference) }
    : { nature: str(wt!.nature), atlRateCompany: str(wt!.atlRateCompany), atlRateOther: str(wt!.atlRateOther), nonAtlRateCompany: str(wt!.nonAtlRateCompany), nonAtlRateOther: str(wt!.nonAtlRateOther), rateNote: str(wt!.rateNote), legalReference: str(wt!.legalReference) });
  const published = !!row.publishedAt;
  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setErrs({});
    try { toast(await work(), { tone: "good" }); onSaved(); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not save the rate"), { tone: "danger" }); }
    finally { setBusy(false); }
  };
  const save = () => run(async () => {
    if (st) await updateSalesTax(st.id, { ...f, rowVersion: st.rowVersion });
    else await updateWithholding(wt!.id, { ...f, rowVersion: wt!.rowVersion });
    return "Scheduled rate saved";
  });
  const cancel = () => run(async () => {
    if (st) await cancelSalesTax(st.id, st.rowVersion);
    else await cancelWithholding(wt!.id, wt!.rowVersion);
    return "Scheduled change cancelled · the previous rate continues";
  });
  const keys = st ? ["rate"] : wt!.usesSalarySlabs ? [] : ["atlRateCompany", "atlRateOther", "nonAtlRateCompany", "nonAtlRateOther"];
  const labels: Record<string, string> = { rate: "Rate (%)", atlRateCompany: "ATL · companies (%)", atlRateOther: "ATL · others (%)", nonAtlRateCompany: "Non-ATL · companies (%)", nonAtlRateOther: "Non-ATL · others (%)" };

  return (
    <AdminRecordModal open onClose={onClose} busy={busy || published} wide title={`${st ? `${st.authorityCode} · ${st.appliesTo}` : wt!.sectionCode} from ${row.effectiveFrom}`}
      subtitle={published ? `Published ${row.masterVersion ?? ""} · read-only (schedule a new rate instead)` : "Scheduled, not published yet"}
      history={{ table: st ? "TaxMasterSalesTaxRates" : "TaxMasterWithholdingRates", id: row.id }} saveLabel="Save" onSave={save}
      extra={!published && <button type="button" className="btn ghost" disabled={busy} onClick={cancel}><Undo2 />Cancel change</button>}>
      <FormGrid>
        {wt && <Field label="Nature" required full error={errs.nature}><input value={s("nature")} disabled={published} maxLength={160} onChange={(e) => set("nature", e.target.value)} /></Field>}
        {keys.map((k) => <Field key={k} label={labels[k]!} error={errs[k]}><input type="number" step="0.1" min={0} max={100} disabled={published} value={s(k)} onChange={(e) => set(k, e.target.value)} /></Field>)}
        {st && <Field label="Reduced / special rates" error={errs.reducedRatesNote}><input value={s("reducedRatesNote")} disabled={published} maxLength={200} onChange={(e) => set("reducedRatesNote", e.target.value)} /></Field>}
        {wt && <Field label="Rate note" error={errs.rateNote}><input value={s("rateNote")} disabled={published} maxLength={120} onChange={(e) => set("rateNote", e.target.value)} /></Field>}
        <Field label="Legal reference" required full error={errs.legalReference}><input value={s("legalReference")} disabled={published} maxLength={200} onChange={(e) => set("legalReference", e.target.value)} /></Field>
      </FormGrid>
    </AdminRecordModal>
  );
}

type SlabRow = { incomeFrom: string; incomeTo: string; fixedTax: string; ratePct: string };
/** Section 149 salary slabs of one tax year (template "Slabs" drawer, made editable). */
export function SlabsModal({ year, existing, onClose, onSaved }: { year: number; existing: SalarySlabYear | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [taxYear, setTaxYear] = useState(String(year));
  const [rows, setRows] = useState<SlabRow[]>(() => existing?.slabs.map((x) => ({ incomeFrom: String(x.incomeFrom), incomeTo: str(x.incomeTo), fixedTax: String(x.fixedTax), ratePct: String(x.ratePct) }))
    ?? [{ incomeFrom: "0", incomeTo: "", fixedTax: "0", ratePct: "0" }]);
  const [legal, setLegal] = useState(existing?.slabs[0]?.legalReference ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = (existing?.importedByTenants ?? 0) > 0;
  const patch = (i: number, p: Partial<SlabRow>) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x))); setErr(null); };
  const add = () => setRows((r) => [...r, { incomeFrom: r[r.length - 1]?.incomeTo || "", incomeTo: "", fixedTax: "0", ratePct: "0" }]);

  const save = async () => {
    setBusy(true);
    try {
      await saveSalarySlabs(Number(taxYear), { legalReference: legal, slabs: rows.map((r) => ({ incomeFrom: r.incomeFrom, incomeTo: r.incomeTo === "" ? null : r.incomeTo, fixedTax: r.fixedTax || 0, ratePct: r.ratePct || 0 })) });
      toast(`Tax year ${taxYear} slabs saved`, { tone: "good" });
      onSaved();
    } catch (e) {
      setErr(adminErrorMessage(e, "Could not save the slabs"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide onClose={onClose} title="Section 149 · salary slabs" subtitle={`Tax year ${taxYear} (FY ${Number(taxYear) - 1}-${String(Number(taxYear) % 100).padStart(2, "0")}) · resident individuals`}
      foot={<><span className="spacer" /><button type="button" className="btn secondary" onClick={onClose}>Close</button>{!locked && <button type="button" className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save slabs"}</button>}</>}>
      {locked && <div className="banner info mb"><Users /><div><b>{existing!.importedByTenants} tenant slab{existing!.importedByTenants === 1 ? "" : "s"} imported from this year</b><p>It can no longer change. Add the next tax year instead.</p></div></div>}
      <FormGrid>
        <Field label="Tax year" required hint="2027 = FY 2026-27"><input type="number" min={2000} max={2100} value={taxYear} disabled={!!existing} onChange={(e) => setTaxYear(e.target.value)} /></Field>
        <Field label="Legal reference"><input value={legal ?? ""} disabled={locked} maxLength={200} placeholder="Finance Act 2026, First Schedule Part I" onChange={(e) => setLegal(e.target.value)} /></Field>
      </FormGrid>
      <div className="table-wrap mt">
        <table className="tbl" data-plain>
          <thead><tr><th>From (Rs / year)</th><th>To</th><th>Fixed tax (Rs)</th><th>Rate on excess (%)</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input type="number" min={0} disabled={locked} value={r.incomeFrom} onChange={(e) => patch(i, { incomeFrom: e.target.value })} /></td>
                <td><input type="number" min={0} disabled={locked} value={r.incomeTo} placeholder={i === rows.length - 1 ? "Open" : ""} onChange={(e) => patch(i, { incomeTo: e.target.value })} /></td>
                <td><input type="number" min={0} disabled={locked} value={r.fixedTax} onChange={(e) => patch(i, { fixedTax: e.target.value })} /></td>
                <td><input type="number" min={0} max={100} step="0.5" disabled={locked} value={r.ratePct} onChange={(e) => patch(i, { ratePct: e.target.value })} /></td>
                <td className="actions">{!locked && rows.length > 1 && <button type="button" className="btn ghost sm" aria-label="Remove slab" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Trash2 /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && <button type="button" className="btn ghost sm mt" onClick={add}><Plus />Add slab</button>}
      {err && <div className="banner danger mt" role="alert"><TriangleAlert /><div><b>Not saved</b><p>{err}</p></div></div>}
    </Modal>
  );
}
