"use client";

import { Check, FileText, History, Paperclip, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DECLARATION_TYPES, type TaxDeclaration, type TaxDeclarationList } from "@/shared";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { HistoryTab } from "@/features/history/components/history-tab";
import { Person } from "@/features/hr/components/attendance-ui";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { approveTaxDeclaration, attachmentUrl, listTaxDeclarations, rejectTaxDeclaration } from "../pay-api";

const n0 = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("en-US"));
const TONE: Record<string, [string, string]> = { PENDING: ["Proof due", "warn"], IN_REVIEW: ["In review", "info"], APPROVED: ["Approved", "good"], REJECTED: ["Rejected", "danger"] };
const kb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** Payroll staff review employees' tax declarations (u/s 60–63): open the proof, approve or reject with a reason. */
export function TaxDeclarationsPanel({ canApprove }: { canApprove: boolean }) {
  const toast = useToast();
  const [status, setStatus] = useState("IN_REVIEW");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<TaxDeclarationList | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [rej, setRej] = useState<{ d: TaxDeclaration; reason: string } | null>(null);
  const [hist, setHist] = useState<TaxDeclaration | null>(null);

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => {
    let cancelled = false;
    listTaxDeclarations({ status, search: q, pageSize: 100 }).then((d) => !cancelled && setData(d)).catch(() => !cancelled && setData({ items: [], total: 0, counts: {} }));
    return () => { cancelled = true; };
  }, [status, q, attempt]);

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast(done, { tone: "good" }); setRej(null); setAttempt((n) => n + 1); } catch (e) { toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const all = data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Tax declarations</h3><p>Zakat (s.60), donations (s.61), health insurance (s.62A) and pension (s.63) · approved declarations reduce withholding from their month</p></div></div>
      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <div className="chips">
          {[["ALL", "All", all], ["IN_REVIEW", "In review", data?.counts.IN_REVIEW ?? 0], ["PENDING", "Proof due", data?.counts.PENDING ?? 0], ["APPROVED", "Approved", data?.counts.APPROVED ?? 0], ["REJECTED", "Rejected", data?.counts.REJECTED ?? 0]].map(([c, l, n]) => (
            <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => setStatus(String(c))}>{l} <i>{n}</i></button>
          ))}
        </div>
      </div>
      <div className="table-wrap"><table className="tbl">
        <thead><tr><th>Employee</th><th>Declaration</th><th>Tax year</th><th className="num">Amount</th><th className="num">Est. saving</th><th>Proof</th><th>Status</th><th /></tr></thead>
        <tbody>
          {!data ? <tr><td colSpan={8}><Skeleton style={{ height: 80 }} /></td></tr> : data.items.length ? data.items.map((d) => {
            const t = DECLARATION_TYPES[d.declarationType as keyof typeof DECLARATION_TYPES];
            const [label, tone] = TONE[d.status] ?? [d.status, "neutral"];
            return (
              <tr key={d.id}>
                <td><Person e={d.employee} sub={[d.employee.code, d.employee.department].filter(Boolean).join(" · ")} /></td>
                <td><b>{t?.label ?? d.declarationType}</b><small>u/s {d.itoSection}{d.paidTo ? ` · ${d.paidTo}` : ""}</small></td>
                <td>{d.taxYear}</td>
                <td className="num">{n0(d.amount)}</td>
                <td className="num">{n0(d.estimatedTaxSaving)}</td>
                <td>{d.proof ? <a className="link" href={attachmentUrl(d.proof.id)} target="_blank" rel="noreferrer"><Paperclip size={13} /> {d.proof.fileName}</a> : <span className="muted">None</span>}{d.proof && <small>{kb(d.proof.sizeBytes)}</small>}</td>
                <td><span className={`badge ${tone} dot`}>{label}</span>{d.status === "APPROVED" && d.verifiedBy && <small>{d.verifiedBy.name} · {dateLabel(d.verifiedAt)}</small>}{d.status === "REJECTED" && d.rejectionReason && <small>{d.rejectionReason}</small>}</td>
                <td className="actions">
                  {canApprove && ["IN_REVIEW", "PENDING"].includes(d.status) && <>
                    <button className="icon-btn-sm" type="button" title={d.proof ? "Approve" : "Upload of the proof is required first"} aria-label={`Approve ${t?.label ?? ""} of ${d.employee.name}`} disabled={busy || !d.proof} onClick={() => act(() => approveTaxDeclaration(d.id), `${t?.label ?? "Declaration"} of ${d.employee.name} approved`)}><Check /></button>
                    <button className="icon-btn-sm" type="button" title="Reject" aria-label={`Reject ${t?.label ?? ""} of ${d.employee.name}`} onClick={() => setRej({ d, reason: "" })}><X /></button>
                  </>}
                  <button className="icon-btn-sm" type="button" title="History" aria-label="History" onClick={() => setHist(d)}><History /></button>
                </td>
              </tr>
            );
          }) : <tr><td colSpan={8}><EmptyState icon={<FileText />} title="No declarations" description="Employees declare Zakat, pension, donations and health insurance in My Profile › Tax." /></td></tr>}
        </tbody>
      </table></div>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Reject declaration?" subtitle={rej ? `${rej.d.employee.name} · ${DECLARATION_TYPES[rej.d.declarationType as keyof typeof DECLARATION_TYPES]?.label ?? ""}` : ""}
        foot={<><button className="btn secondary" type="button" onClick={() => setRej(null)}>Cancel</button><button className="btn danger" type="button" disabled={busy || (rej?.reason.trim().length ?? 0) < 3} onClick={() => rej && act(() => rejectTaxDeclaration(rej.d.id, rej.reason), "Declaration rejected")}>Reject</button></>}>
        {rej && <Field label="Reason" required full><input value={rej.reason} maxLength={500} placeholder="e.g. Certificate is for the previous tax year" onChange={(e) => setRej({ ...rej, reason: e.target.value })} /></Field>}
      </Modal>
      <Modal open={!!hist} onClose={() => setHist(null)} wide title={hist ? `${hist.employee.name} · declaration history` : ""}>{hist && <HistoryTab schema="Payroll" table="TaxDeclarations" id={hist.id} />}</Modal>
    </div>
  );
}
