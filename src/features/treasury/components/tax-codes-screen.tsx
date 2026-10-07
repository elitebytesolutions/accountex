"use client";

import { History, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { TaxCode, TaxCodeCreateFields } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { createTaxCode, deleteTaxCode, listTaxCodes, setTaxCodeActive, updateTaxCode } from "../api";
import { AccountOptions, apiFieldErrors, apiMessage, usePostableAccounts } from "./treasury-ui";

type Can = { create: boolean; edit: boolean };
type Chip = "all" | "SALES_TAX" | "WITHHOLDING" | "inactive";
const LOOKUPS = ["TaxType", "TaxCodeAppliesTo", "RateBasis", "SalesTaxKind"];
type RateRow = { id?: string; effectiveFrom: string; effectiveTo: string; rate: string; nonAtlRate: string; financeAct: string };
type Form = Omit<TaxCodeCreateFields, "rates"> & { rates: RateRow[] };

const blank = (): Form => ({
  code: "", description: "", taxType: "WITHHOLDING", appliesTo: "VENDOR_PAYMENTS", rateBasis: "PERCENT", salesTaxKind: null, whtSection: "", whtNature: "",
  accountId: null, inputAccountId: null, fbrReference: "", calcOnExclSalesTax: true, checkAtl: false,
  rates: [{ effectiveFrom: `${new Date().getFullYear()}-07-01`, effectiveTo: "", rate: "", nonAtlRate: "", financeAct: "" }],
});
const toForm = (t: TaxCode): Form => ({
  code: t.code, description: t.description, taxType: t.taxType, appliesTo: t.appliesTo, rateBasis: t.rateBasis, salesTaxKind: t.salesTaxKind,
  whtSection: t.whtSection ?? "", whtNature: t.whtNature ?? "", accountId: t.account?.id ?? null, inputAccountId: t.inputAccount?.id ?? null,
  fbrReference: t.fbrReference ?? "", calcOnExclSalesTax: t.calcOnExclSalesTax, checkAtl: t.checkAtl,
  rates: t.rates.map((r) => ({ id: r.id, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo ?? "", rate: r.rate?.toString() ?? "", nonAtlRate: r.nonAtlRate?.toString() ?? "", financeAct: r.financeAct ?? "" })),
});
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const rateText = (t: TaxCode) => (t.rateBasis === "SLAB" ? "Slab" : t.rateBasis === "NONE" || !t.currentRate || t.currentRate.rate === null ? "—" : `${t.currentRate.rate.toFixed(2)}%`);

/** Template app/tax/codes (42-acc-reports.html): tax code list with chips and switches, and the new / edit tax code modal. */
export function TaxCodesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const accounts = usePostableAccounts();
  const [rows, setRows] = useState<TaxCode[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [edit, setEdit] = useState<TaxCode | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TaxCode | null>(null);
  const [history, setHistory] = useState<TaxCode | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTaxCodes()
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load tax codes" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  const reload = () => setAttempt((n) => n + 1);

  const open = (t: TaxCode | "new") => {
    setEdit(t);
    setForm(t === "new" ? blank() : toForm(t));
    setErrs({});
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setRate = (i: number, k: keyof RateRow, v: string) => setForm((f) => (f ? { ...f, rates: f.rates.map((r, j) => (j === i ? { ...r, [k]: v } : r)) } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    const sales = form.taxType === "SALES_TAX";
    const body = {
      ...form,
      salesTaxKind: sales ? form.salesTaxKind : null,
      whtSection: sales ? null : form.whtSection,
      whtNature: sales ? null : form.whtNature,
      inputAccountId: sales ? form.inputAccountId : null,
      accountId: form.rateBasis === "NONE" ? null : form.accountId,
      rates: form.rateBasis === "NONE" ? [] : form.rates.map((r) => ({
        ...(r.id && { id: r.id }), effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo || null,
        rate: form.rateBasis === "SLAB" ? null : num(r.rate), nonAtlRate: num(r.nonAtlRate), financeAct: r.financeAct || null,
      })),
    };
    try {
      const saved = edit && edit !== "new" ? await updateTaxCode(edit.id, { ...body, rowVersion: edit.rowVersion }) : await createTaxCode(body);
      toast(`Tax code ${saved.code} saved`, { tone: "good" });
      setEdit(null);
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the tax code"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (t: TaxCode) => {
    try {
      await setTaxCodeActive(t.id, !t.isActive, t.rowVersion);
      toast(`${t.code} ${t.isActive ? "deactivated" : "activated"}`, { tone: t.isActive ? "warn" : "good" });
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not update"), { tone: "danger" });
    }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteTaxCode(removing.id, removing.rowVersion);
      toast(`${removing.code} deleted`, { tone: "good" });
      setRemoving(null);
      setEdit(null);
      reload();
    } catch (e) {
      toast(apiMessage(e, "Could not delete"), { tone: "danger" });
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const all = rows ?? [];
  const needle = q.trim().toLowerCase();
  const shown = all.filter(
    (t) =>
      (chip === "all" || (chip === "inactive" ? !t.isActive : t.taxType === chip || (chip === "WITHHOLDING" && t.taxType === "COLLECTION"))) &&
      (!needle || `${t.code} ${t.description} ${t.fbrReference ?? ""}`.toLowerCase().includes(needle)),
  );
  const count = (c: Chip) => all.filter((t) => (c === "all" ? true : c === "inactive" ? !t.isActive : t.taxType === c || (c === "WITHHOLDING" && t.taxType === "COLLECTION"))).length;
  const sales = form?.taxType === "SALES_TAX";

  return (
    <>
      <PageHead
        eyebrow="Tax & Compliance / Tax Codes"
        title="Tax Codes"
        description="Sales tax and income tax withholding codes applied on invoices, bills and payments — mapped to GL accounts."
        actions={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New Tax Code</Button>}
      />
      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}
      <div className="panel flush">
        <div className="panel-head"><div><h3>Tax codes</h3><p>Sales tax, further tax and withholding</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search tax codes…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="chips">
            {(["all", "SALES_TAX", "WITHHOLDING", "inactive"] as Chip[]).map((c) => (
              <button key={c} type="button" className={cn(chip === c && "active")} onClick={() => setChip(c)}>
                {c === "all" ? "All" : c === "inactive" ? "Inactive" : c === "SALES_TAX" ? "Sales tax" : "Withholding"} <i>{count(c)}</i>
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="small muted">Rates in force today</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Code</th><th>Description</th><th>Type</th><th>Applies to</th><th className="num">Rate</th><th>Tax account</th><th>FBR reference</th><th>Active</th><th /></tr></thead>
            <tbody>
              {!rows && [0, 1, 2].map((i) => <tr key={i}><td colSpan={9}><Skeleton style={{ height: 18 }} /></td></tr>)}
              {shown.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.code}</b></td>
                  <td>{t.description}</td>
                  <td><Badge tone={t.taxType === "SALES_TAX" ? "info" : "violet"}>{labelOf(lookups, "TaxType", t.taxType)}</Badge></td>
                  <td>{labelOf(lookups, "TaxCodeAppliesTo", t.appliesTo)}</td>
                  <td className={cn("num", rateText(t) === "—" && "zero")}>{rateText(t)}</td>
                  <td className={cn(!t.account && "muted")}>{t.account ? `${t.account.code} ${t.account.name}` : "Not posted"}{t.inputAccount && <small>{t.inputAccount.code} {t.inputAccount.name}</small>}</td>
                  <td>{t.fbrReference ?? (t.whtSection ? `Sec ${t.whtSection}` : "—")}</td>
                  <td>
                    <label className="switch"><input type="checkbox" checked={t.isActive} disabled={!can.edit} onChange={() => toggle(t)} aria-label={`${t.code} active`} /><i /></label>
                  </td>
                  <td className="actions">
                    <button type="button" className="icon-btn-sm" aria-label={`Edit ${t.code}`} onClick={() => open(t)}><Pencil /></button>
                  </td>
                </tr>
              ))}
              {rows && !all.length && (
                <tr><td colSpan={9}><EmptyState title="No tax codes yet" description="Add the sales tax and withholding codes your invoices, bills and payments use." action={can.create && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New Tax Code</Button>} /></td></tr>
              )}
              {rows && all.length > 0 && !shown.length && <tr><td colSpan={9} className="muted" style={{ textAlign: "center", padding: 28 }}>No tax codes match.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="table-foot"><span>{all.length} tax codes · {all.filter((t) => t.isActive).length} active</span></div>
      </div>

      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        wide
        title={edit && edit !== "new" ? `Edit ${edit.code}` : "New tax code"}
        subtitle="Define rate, applicability and GL mapping."
        foot={
          <>
            {edit && edit !== "new" && (
              <span className="row" style={{ marginRight: "auto", gap: 6 }}>
                <button type="button" className="btn ghost" onClick={() => setHistory(edit)}><History />History</button>
                {can.edit && <button type="button" className="btn ghost" style={{ color: "var(--danger)" }} onClick={() => setRemoving(edit)}><Trash2 />Delete</button>}
              </span>
            )}
            <button type="button" className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
            {(edit === "new" ? can.create : can.edit) && <button type="button" className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save tax code"}</button>}
          </>
        }
      >
        {form && (
          <>
            <FormGrid cols={3}>
              <Field label="Code" required error={errs.code}><input value={form.code} placeholder="e.g. WHT-236Y" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
              <Field label="Description" required full error={errs.description}><input value={form.description} placeholder="e.g. Advance tax on remittance abroad" onChange={(e) => set("description", e.target.value)} /></Field>
              <Field label="Type" error={errs.taxType}>
                <select value={form.taxType} onChange={(e) => set("taxType", e.target.value)}>{lookupOptions(lookups, "TaxType", form.taxType).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
              </Field>
              <Field label="Applies to" error={errs.appliesTo}>
                <select value={form.appliesTo} onChange={(e) => set("appliesTo", e.target.value)}>{lookupOptions(lookups, "TaxCodeAppliesTo", form.appliesTo).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
              </Field>
              <Field label="Rate basis" error={errs.rateBasis}>
                <select value={form.rateBasis} onChange={(e) => set("rateBasis", e.target.value)}>{lookupOptions(lookups, "RateBasis", form.rateBasis).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>
              </Field>
              {sales ? (
                <Field label="Sales tax kind" required error={errs.salesTaxKind}>
                  <select value={form.salesTaxKind ?? ""} onChange={(e) => set("salesTaxKind", e.target.value || null)}>
                    <option value="">Choose…</option>
                    {lookupOptions(lookups, "SalesTaxKind", form.salesTaxKind).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="Section" required error={errs.whtSection}><input value={form.whtSection ?? ""} placeholder="e.g. 153(1)(a)" onChange={(e) => set("whtSection", e.target.value)} /></Field>
                  <Field label="Nature of payment" error={errs.whtNature}><input value={form.whtNature ?? ""} placeholder="e.g. Supply of goods" onChange={(e) => set("whtNature", e.target.value)} /></Field>
                </>
              )}
              <Field label="Tax account" required={form.rateBasis !== "NONE"} error={errs.accountId}>
                <select value={form.accountId ?? ""} disabled={form.rateBasis === "NONE"} onChange={(e) => set("accountId", e.target.value || null)}>
                  <AccountOptions accounts={accounts} classes={[1, 2]} current={edit && edit !== "new" ? edit.account : null} />
                </select>
              </Field>
              {sales && (
                <Field label="Input tax account" error={errs.inputAccountId} hint="Purchases claim input tax here">
                  <select value={form.inputAccountId ?? ""} disabled={form.rateBasis === "NONE"} onChange={(e) => set("inputAccountId", e.target.value || null)}>
                    <AccountOptions accounts={accounts} classes={[1, 2]} current={edit && edit !== "new" ? edit.inputAccount : null} empty="None" />
                  </select>
                </Field>
              )}
              <Field label="FBR legal reference" full error={errs.fbrReference}><input value={form.fbrReference ?? ""} placeholder="Section / schedule" onChange={(e) => set("fbrReference", e.target.value)} /></Field>
              <Check label="Calculate on amount excluding sales tax" checked={form.calcOnExclSalesTax} onChange={(e) => set("calcOnExclSalesTax", e.target.checked)} />
              <Check label="Check vendor ATL status before applying" checked={form.checkAtl} onChange={(e) => set("checkAtl", e.target.checked)} />
            </FormGrid>

            {form.rateBasis !== "NONE" && (
              <div className="mt">
                <div className="row" style={{ marginBottom: 8 }}>
                  <b className="small">Rates</b><span className="small muted">Dated history — a new Finance Act rate starts a new row</span><span className="spacer" />
                  <button type="button" className="btn ghost sm" onClick={() => set("rates", [...form.rates, { effectiveFrom: "", effectiveTo: "", rate: "", nonAtlRate: "", financeAct: "" }])}><Plus />Add rate</button>
                </div>
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Effective from</th><th>Until</th>{form.rateBasis === "PERCENT" && <th className="num">Rate %</th>}<th className="num">Non-ATL %</th><th>Finance Act</th><th /></tr></thead>
                    <tbody>
                      {form.rates.map((r, i) => (
                        <tr key={r.id ?? `n${i}`}>
                          <td><input type="date" style={{ width: 150 }} value={r.effectiveFrom} onChange={(e) => setRate(i, "effectiveFrom", e.target.value)} aria-label="Effective from" /></td>
                          <td><input type="date" style={{ width: 150 }} value={r.effectiveTo} onChange={(e) => setRate(i, "effectiveTo", e.target.value)} aria-label="Until" /></td>
                          {form.rateBasis === "PERCENT" && <td className="num"><input inputMode="decimal" style={{ width: 72, textAlign: "right" }} value={r.rate} placeholder="0.00" onChange={(e) => setRate(i, "rate", e.target.value)} aria-label="Rate" /></td>}
                          <td className="num"><input inputMode="decimal" style={{ width: 80, textAlign: "right" }} value={r.nonAtlRate} placeholder="—" onChange={(e) => setRate(i, "nonAtlRate", e.target.value)} aria-label="Non-ATL rate" /></td>
                          <td style={{ width: "100%" }}><input style={{ minWidth: 150, width: "100%" }} value={r.financeAct} placeholder="e.g. Finance Act 2026" onChange={(e) => setRate(i, "financeAct", e.target.value)} aria-label="Finance Act" /></td>
                          <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Remove rate" onClick={() => set("rates", form.rates.filter((_, j) => j !== i))}><X /></button></td>
                        </tr>
                      ))}
                      {!form.rates.length && <tr><td colSpan={6} className="muted small">No rates yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
                {errs.rates && <small className="hint text-danger" role="alert">{errs.rates}</small>}
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} title={`Delete ${removing?.code ?? ""}?`} confirmLabel="Delete" danger busy={busy} onConfirm={remove}>
        Only unused tax codes can be deleted. A code used on documents, products or settings is deactivated instead.
      </ConfirmDialog>
      <Drawer open={!!history} onClose={() => setHistory(null)} title={history ? `${history.code} history` : "History"} subtitle="Every change, with who made it">
        {history && <HistoryTab schema="Tax" table="TaxCodes" id={history.id} />}
      </Drawer>
    </>
  );
}
