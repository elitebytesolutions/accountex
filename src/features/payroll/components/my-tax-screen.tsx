"use client";

import { Check, FileText, HeartHandshake, Info, Landmark, MoonStar, Paperclip, Pencil, PiggyBank, Plus, ShieldCheck, ShieldPlus, Sparkles, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DECLARATION_TYPES, PROOF_MAX_BYTES, PROOF_TYPES, payrollAnnualTax, type DeclarationType, type MyTaxView, type TaxDeclaration } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { EsRing } from "@/features/hr/components/ess-bits";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { attachmentUrl, declareTax, myTax, uploadTaxProof } from "../pay-api";

const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
const money = (v: number) => `Rs ${n0(v)}`;
const ORDER: DeclarationType[] = ["ZAKAT", "VPS_PENSION", "DONATION", "HEALTH_INSURANCE"];
const UI: Record<DeclarationType, { icon: typeof MoonStar; tone: string; sec: string }> = {
  ZAKAT: { icon: MoonStar, tone: "green", sec: "u/s 60 · deductible allowance" },
  VPS_PENSION: { icon: PiggyBank, tone: "blue", sec: "u/s 63 · tax credit" },
  DONATION: { icon: HeartHandshake, tone: "violet", sec: "u/s 61 · tax credit" },
  HEALTH_INSURANCE: { icon: ShieldPlus, tone: "orange", sec: "u/s 62A · tax credit" },
};
const STATUS: Record<string, [string, string]> = { PENDING: ["Proof due", "warn"], IN_REVIEW: ["In review", "info"], APPROVED: ["Approved", "good"], REJECTED: ["Rejected", "danger"], NOT_DECLARED: ["Not declared", "neutral"] };
const kb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
/** Client-side check before upload (the API enforces the same type and size). */
const fileProblem = (f: File) => (!(PROOF_TYPES as readonly string[]).includes(f.type) ? "Use a PDF, JPG or PNG file." : f.size > PROOF_MAX_BYTES ? `The file is larger than ${PROOF_MAX_BYTES / 1024 / 1024} MB.` : null);

/** My Profile › Tax (template app/profile/tax, 9C-ess.js:1094–1250): projection under the salaried slabs and declarations with proof upload. */
export function MyTaxScreen({ can }: { can: { create: boolean; edit: boolean } }) {
  const toast = useToast();
  const [data, setData] = useState<MyTaxView | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string; noEmployee?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState<{ type: DeclarationType; amount: string; paidTo: string; file: File | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef<TaxDeclaration | null>(null);

  useEffect(() => {
    let cancelled = false;
    myTax().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId, noEmployee: e.code === "NO_EMPLOYEE_RECORD" } : { message: "Could not load your tax projection" }));
    return () => { cancelled = true; };
  }, [attempt]);

  // a user not linked to an employee record has no payroll data: an empty state, not an error (as My Leave)
  if (error?.noEmployee) return <><PageHead eyebrow="My Money / Tax" title="Tax Declarations" description="Projection under the FBR salaried slabs. Declare Zakat, pension and donations to cut your monthly withholding." /><EmptyState title="No employee record" description="Your login is not linked to an employee record yet. Ask HR to link it on your employee profile." /></>;
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} />;
  const p = data?.projection ?? null;
  const decl = (t: DeclarationType) => data?.declarations.find((d) => d.declarationType === t) ?? null;
  const declared = ORDER.filter((t) => { const d = decl(t); return d && d.status !== "NOT_DECLARED" && d.status !== "REJECTED"; }).length;
  const saved = p ? Math.max(0, p.withoutDeclarations.liability - p.withApproved.liability) : 0;
  const c = p?.withApproved;
  const zakatSave = p ? Math.max(0, p.withoutDeclarations.slabTax - payrollAnnualTax(p.projectedTaxable, p.slabs, { ZAKAT: p.withApproved.zakat }).slabTax) : 0;
  const open = (t: DeclarationType) => { const d = decl(t); setSheet({ type: t, amount: d ? String(d.amount) : "", paidTo: d?.paidTo ?? "", file: null }); };
  const next = ORDER.find((t) => !decl(t)) ?? "DONATION";

  // live preview in the sheet: saving of this declaration on top of the approved ones
  const preview = (() => {
    if (!sheet || !p) return null;
    const amt = Number(sheet.amount || 0);
    const approved = Object.fromEntries(ORDER.map((t) => [t, data?.declarations.filter((d) => d.declarationType === t && d.status === "APPROVED" && t !== sheet.type).reduce((a, d) => a + d.amount, 0) ?? 0]));
    const without = payrollAnnualTax(p.projectedTaxable, p.slabs, approved);
    const withIt = payrollAnnualTax(p.projectedTaxable, p.slabs, { ...approved, [sheet.type]: amt });
    return { saving: Math.max(0, without.liability - withIt.liability), monthly: Math.max(0, Math.round((withIt.liability - p.ytdTax) / Math.max(1, p.monthsLeft))) };
  })();

  const save = async () => {
    if (!sheet) return;
    const amount = Number(sheet.amount || 0);
    if (!amount) { toast("Enter an amount", { tone: "warn" }); return; }
    if (sheet.file) { const pr = fileProblem(sheet.file); if (pr) { toast(pr, { tone: "danger" }); return; } }
    setBusy(true);
    try {
      const d = await declareTax({ declarationType: sheet.type, amount, paidTo: sheet.paidTo || null });
      if (sheet.file) await uploadTaxProof(d.id, sheet.file);
      toast(`${DECLARATION_TYPES[sheet.type].label} declared${sheet.file ? " · proof sent for review" : " · upload the proof for payroll to review"}`, { tone: "good" });
      setSheet(null);
      setAttempt((n) => n + 1);
    } catch (e) { toast(apiMessage(e, "Could not save the declaration"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const pick = (d: TaxDeclaration) => { target.current = d; picker.current?.click(); };
  const onPicked = async (f: File | undefined) => {
    const d = target.current;
    if (picker.current) picker.current.value = "";
    if (!f || !d) return;
    const pr = fileProblem(f);
    if (pr) { toast(pr, { tone: "danger" }); return; }
    setUploading(d.id);
    try { await uploadTaxProof(d.id, f); toast("Proof uploaded · payroll will review it", { tone: "good" }); setAttempt((n) => n + 1); }
    catch (e) { toast(apiMessage(e, "Could not upload the proof"), { tone: "danger" }); } finally { setUploading(null); }
  };

  const x = c?.taxableIncome ?? 0;
  return (
    <>
      <PageHead eyebrow="My Money / Tax" title="Tax Declarations"
        description={`FY ${p?.taxYear ?? ""} projection under the FBR salaried slabs. Declare Zakat, pension and donations to cut your monthly withholding.`}
        actions={<>
          <Link className="btn secondary" href="/profile/payslips"><FileText />Payslips</Link>
          {can.create && <button className="btn primary" type="button" disabled={!data} onClick={() => open(next)}><Plus />Add declaration</button>}
        </>} />
      <input ref={picker} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => void onPicked(e.target.files?.[0])} />
      {!data ? <Skeleton style={{ height: 420 }} /> : <>
        {!p ? <div className="banner info mb"><Info /><div><b>No projection yet</b><p>The projection appears once your salary and the company&apos;s tax slabs for this year are set up.</p></div></div> : (
          <div className="es-grid es-wide">
            <div className="es-card es-tx-proj">
              <div className="es-head"><div><h3>FY {p.taxYear} projection</h3><p>Salaried individual · {p.monthsLeft} month{p.monthsLeft === 1 ? "" : "s"} left · taxable so far Rs {n0(p.ytdTaxable)}</p></div><span className="spacer" /><span className="pill"><Landmark />FBR slabs <b>{p.taxYear}</b></span></div>
              <div className="es-tx-figs">
                <div><span className="es-label">Projected taxable income</span><b className="num-big">{money(x)}</b><small>Rs {n0(p.monthlyTaxable)} a month × {p.monthsLeft}{p.exemptAnnual ? ` · exempt Rs ${n0(p.exemptAnnual)}` : ""}{c?.zakat ? ` − Zakat Rs ${n0(c.zakat)}` : ""}</small></div>
                <div><span className="es-label">Annual tax</span><b className="es-tx-fig">{money(c?.liability ?? 0)}</b><small>Effective rate <b>{x ? (((c?.liability ?? 0) / x) * 100).toFixed(2) : "0.00"}%</b></small></div>
                <div><span className="es-label">Monthly from now</span><b className="es-tx-fig">{money(p.monthlyTax)}</b><small>Deducted so far Rs {n0(p.ytdTax)}</small></div>
              </div>
              <div className="es-tx-slabs">
                {p.slabs.map((s, i) => {
                  const top = s.incomeTo ?? Math.max(x, s.incomeFrom * 1.5 || 1);
                  const fill = x <= s.incomeFrom ? 0 : Math.min(1, (x - s.incomeFrom) / Math.max(1, top - s.incomeFrom));
                  const part = x > s.incomeFrom ? ((Math.min(x, top) - s.incomeFrom) * s.ratePercent) / 100 : 0;
                  const here = x >= s.incomeFrom && (s.incomeTo === null || x < s.incomeTo);
                  const m = (v: number) => `${(v / 1e6).toFixed(1).replace(".0", "")}M`;
                  return (
                    <div key={i} className={cn("es-tx-slab", here && "here", fill === 0 && "idle")} style={{ ["--i" as string]: i }}>
                      <span className="es-tx-slab-l"><b>{s.incomeTo === null ? `Above Rs ${m(s.incomeFrom)}` : `${s.incomeFrom ? `Rs ${m(s.incomeFrom)}` : "Rs 0"} – ${m(s.incomeTo)}`}</b><small>{s.ratePercent ? `${s.fixedTax ? `Rs ${n0(s.fixedTax)} + ` : ""}${s.ratePercent}% of excess` : "Exempt"}</small></span>
                      <span className="es-tx-rate">{s.ratePercent}%</span>
                      <span className="es-tx-track"><i style={{ width: `${(fill * 100).toFixed(1)}%` }} />{here && <em>You · Rs {(x / 1e6).toFixed(2)}M</em>}</span>
                      <b className="es-tx-part">{part ? `Rs ${n0(part)}` : "—"}</b>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="es-col">
              <div className="es-card night es-tx-hero">
                <div className="es-head"><h3>Tax saved this year</h3><span className="spacer" /><EsRing size={62} tone="var(--lime)" pct={(declared / 4) * 100} label={`${declared}/4`} sub="declared" /></div>
                <b className="num-big es-tx-saved">{money(saved)}</b>
                <p className="es-tx-drop">{p.monthlyTaxIfApproved !== p.monthlyTax ? <>Once payroll approves your pending declarations, withholding drops from <b>{money(p.monthlyTax)}</b> to <b>{money(p.monthlyTaxIfApproved)}</b> a month</> : <>Monthly withholding <b>{money(p.monthlyTax)}</b></>}</p>
                <div className="es-tx-credits">
                  {[["Zakat allowance", zakatSave], ["VPS credit", c?.credits.VPS_PENSION ?? 0], ["Donation credit", c?.credits.DONATION ?? 0], ["Health credit", c?.credits.HEALTH_INSURANCE ?? 0]].map(([l, v]) => <div key={l as string}><span>{l}</span><b>{v ? money(v as number) : "—"}</b></div>)}
                </div>
                {can.create && <button className="btn lime" type="button" onClick={() => open(next)}><Plus />Add a declaration</button>}
              </div>
              <div className="es-card"><div className="es-head"><h3>Good to know</h3></div><ul className="es-tx-notes">
                <li><Info /><span>Zakat deducted by your bank on 1 Ramadan is a deductible allowance under <b>section 60</b>.</span></li>
                <li><Info /><span>Pension, donations and health premiums earn a credit at your <b>average tax rate</b>.</span></li>
                <li><ShieldCheck /><span>Only declarations payroll has approved (with proof) reduce the tax deducted, from the month they are approved.</span></li>
              </ul></div>
            </div>
          </div>
        )}
        <div className="es-head es-tx-sh"><h3>My declarations</h3><span className="spacer" /><span className="es-label">Upload proof (PDF, JPG or PNG up to 5 MB) for payroll to review</span></div>
        <div className="es-grid es-g2 es-tx-decs">
          {ORDER.map((t, i) => {
            const d = decl(t);
            const on = !!d && d.status !== "NOT_DECLARED";
            const meta = DECLARATION_TYPES[t];
            const I = UI[t].icon;
            const [st, tone] = STATUS[d?.status ?? "NOT_DECLARED"] ?? ["", "neutral"];
            return (
              <article key={t} className={cn("es-card es-tx-dec", on && "on")} style={{ ["--i" as string]: i }}>
                <div className="es-head"><span className={`icon-tile ${UI[t].tone}`}><I /></span><div><h3>{meta.label}</h3><p>{UI[t].sec}</p></div><span className="spacer" /><span className={`badge ${tone} dot`}>{st}</span></div>
                {on && d ? <>
                  <div className="es-tx-dec-amt"><b>{money(d.amount)}</b>{d.estimatedTaxSaving ? <span className="pill"><Sparkles />Saves <b className="up">{money(d.estimatedTaxSaving)}</b></span> : null}</div>
                  <span className="es-label">{d.paidTo ?? meta.how}</span>
                  <div className="es-tx-proof">
                    {d.proof ? <div className="es-files"><a className="es-file" href={attachmentUrl(d.proof.id)} target="_blank" rel="noreferrer"><Paperclip /><div><b>{d.proof.fileName}</b><small>{kb(d.proof.sizeBytes)}</small></div></a></div>
                      : can.edit && d.status !== "APPROVED" ? <button type="button" className="es-drop" disabled={uploading === d.id} onClick={() => pick(d)}><UploadCloud /><span><b>{uploading === d.id ? "Uploading…" : "Upload proof"}</b> · certificate or bank statement</span></button> : null}
                  </div>
                  <div className="es-row es-tx-dec-foot">
                    {can.edit && d.status !== "APPROVED" && <button className="btn ghost sm" type="button" onClick={() => open(t)}><Pencil />Edit</button>}
                    {can.edit && d.proof && d.status !== "APPROVED" && <button className="btn ghost sm" type="button" onClick={() => pick(d)}><UploadCloud />Replace proof</button>}
                    <span className="spacer" />
                    <span className="es-label">{d.status === "APPROVED" ? `Verified${d.verifiedBy ? ` by ${d.verifiedBy.name}` : ""} · ${dateLabel(d.verifiedAt)}` : d.status === "REJECTED" ? `Rejected: ${d.rejectionReason ?? ""}` : d.proof ? "Payroll reviews the proof" : "Proof needed before payroll can approve"}</span>
                  </div>
                </> : <>
                  <div className="es-tx-dec-amt ghost"><span className="es-label">{meta.how}</span></div>
                  <div className="es-row es-tx-dec-foot">{can.create && <button className="btn primary sm" type="button" onClick={() => open(t)}><Plus />Declare</button>}</div>
                </>}
              </article>
            );
          })}
        </div>
        {!data.declarations.length && !p && <EmptyState title="Nothing declared yet" description="Declare Zakat, pension contributions, donations or health insurance to reduce your monthly tax." />}
      </>}

      <Modal open={!!sheet} onClose={() => setSheet(null)} title={sheet && decl(sheet.type) ? "Edit declaration" : "Add a declaration"} subtitle={`FY ${p?.taxYear ?? ""} · applies from the payroll after payroll verifies your proof`}
        foot={<><button className="btn secondary" type="button" onClick={() => setSheet(null)}>Cancel</button><button className="btn primary" type="button" disabled={busy} onClick={save}><Check />{busy ? "Saving…" : "Save declaration"}</button></>}>
        {sheet && <>
          <div className="es-field"><span>Type</span><div className="es-opts es-tx-types">{ORDER.map((t) => { const I = UI[t].icon; const locked = decl(t)?.status === "APPROVED"; return <button key={t} type="button" disabled={locked} title={locked ? "Approved — ask payroll to change it" : undefined} className={cn("es-opt", t === sheet.type && "on")} onClick={() => { const d = decl(t); setSheet({ type: t, amount: d ? String(d.amount) : "", paidTo: d?.paidTo ?? "", file: null }); }}><I />{DECLARATION_TYPES[t].label}</button>; })}</div></div>
          <div className="form-grid" style={{ marginTop: 14 }}>
            <label><span>Amount (Rs)</span><input inputMode="decimal" value={sheet.amount} onChange={(e) => setSheet({ ...sheet, amount: e.target.value.replace(/[^\d.]/g, "") })} /></label>
            <label><span>Paid to</span><input value={sheet.paidTo} maxLength={160} placeholder="e.g. Meezan Bank · auto-deducted 1 Ramadan" onChange={(e) => setSheet({ ...sheet, paidTo: e.target.value })} /></label>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>{DECLARATION_TYPES[sheet.type].how}</p>
          <div className="es-field" style={{ marginTop: 14 }}><span>Proof</span>
            <label className="es-drop"><UploadCloud /><span><b>{sheet.file ? sheet.file.name : "Choose a file"}</b> · PDF, JPG or PNG up to 5 MB</span>
              <input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && fileProblem(f)) { toast(fileProblem(f)!, { tone: "danger" }); return; } setSheet({ ...sheet, file: f }); }} />
            </label>
          </div>
          {preview && <div className="es-tx-preview"><div><span className="es-label">This declaration saves</span><b>{money(preview.saving)}</b></div><div><span className="es-label">New monthly tax</span><b>{money(preview.monthly)}</b></div></div>}
        </>}
      </Modal>
    </>
  );
}
