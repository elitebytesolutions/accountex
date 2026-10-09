"use client";

import { FileText, Plus, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { WhtCertificate } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import {
  cancelCertificate, certificatePrint, claimCertificate, deleteCertificate, generateCertificates, issueCertificate, listCertificates, receiveCertificate, type TaxOptions,
} from "../api";
import { CERT_LABEL, CERT_TONE, fmtDate, money, sectionCode, today } from "./tax-ui";

type Can = { create: boolean; edit: boolean; approve: boolean; post: boolean; export: boolean };
type Dir = "ISSUED" | "RECEIVED";
const esc = (s: string | null | undefined) => (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Fiscal quarter (Jul–Jun year) of a month: first and last day. */
function quarterOf(period: string) {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const start = Math.floor((m - 1) / 3) * 3 + 1;
  const from = `${y}-${String(start).padStart(2, "0")}-01`;
  const to = new Date(Date.UTC(y, start + 2, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/** Opens a print window with the deduction certificate (browser print; no server PDF). */
async function printCertificate(id: string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return;
  const { certificate: c, deductions, company } = await certificatePrint(id);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.certificateNo)}</title>
<style>body{font:13px/1.45 system-ui,sans-serif;color:#111;margin:32px}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}td.n,th.n{text-align:right}.muted{color:#555}.grid{display:grid;grid-template-columns:180px 1fr;gap:4px 12px;margin-top:16px}</style></head><body>
<h1>Certificate of collection / deduction of income tax</h1><div class="muted">Under rule 42 of the Income Tax Rules, 2002 · ${esc(c.certificateNo)}</div>
<div class="grid"><b>Withholding agent</b><span>${esc(company.name)} · NTN ${esc(company.ntn)}</span>
<b>Taxpayer</b><span>${esc(c.party)}${c.partyNtnCnic ? ` · NTN/CNIC ${esc(c.partyNtnCnic)}` : ""}</span>
<b>Section</b><span>${esc(sectionCode(c.whtSection))}</span><b>Period</b><span>${fmtDate(c.periodFrom)} – ${fmtDate(c.periodTo)}</span>
<b>CPR</b><span>${esc(c.cprNo ?? "—")}</span><b>Issued on</b><span>${fmtDate(c.issuedOn)}</span></div>
<table><thead><tr><th>Date</th><th>Document</th><th class="n">Amount</th><th class="n">Rate</th><th class="n">Tax deducted</th></tr></thead><tbody>
${deductions.map((d) => `<tr><td>${fmtDate(d.deductionDate)}</td><td>${esc(d.source?.docNo ?? "—")}</td><td class="n">${money(d.taxableAmount)}</td><td class="n">${d.taxRate ?? ""}${d.taxRate !== null ? "%" : ""}</td><td class="n">${money(d.taxAmount)}</td></tr>`).join("")}
<tr><th colspan="2">Total</th><th class="n">${money(c.taxableAmount)}</th><th></th><th class="n">${money(c.taxAmount)}</th></tr></tbody></table>
<p class="muted" style="margin-top:40px">Authorised signatory: ______________________</p></body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/** Deduction certificates issued to vendors / employees and certificates received from customers. */
export function CertificatesDrawer({ open, onClose, period, options, can }: { open: boolean; onClose: () => void; period: string; options: TaxOptions | null; can: Can }) {
  const toast = useToast();
  const [dir, setDir] = useState<Dir>("ISSUED");
  const [rows, setRows] = useState<WhtCertificate[] | null>(null);
  const [selected, setSelected] = useState<WhtCertificate | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [confirm, setConfirm] = useState<null | "cancel" | "delete">(null);
  const q = quarterOf(period);
  const [range, setRange] = useState(q);
  const [seen, setSeen] = useState(false);
  if (open !== seen) { setSeen(open); if (open) { setRange(quarterOf(period)); setSelected(null); } }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listCertificates({ direction: dir, pageSize: 100 }).then((r) => !cancelled && setRows(r.items)).catch(() => !cancelled && setRows([]));
    return () => { cancelled = true; };
  }, [open, dir, attempt]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok, { tone: "good" });
      setSelected(null);
      setConfirm(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      toast(apiMessage(e, "Could not complete that"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onClose={onClose} wide title="WHT certificates" subtitle="Deduction certificates we issue, and certificates received from customers">
      <div className="tabs">
        <button type="button" className={dir === "ISSUED" ? "active" : undefined} onClick={() => { setDir("ISSUED"); setSelected(null); }}>Issued by us</button>
        <button type="button" className={dir === "RECEIVED" ? "active" : undefined} onClick={() => { setDir("RECEIVED"); setSelected(null); }}>Received from customers</button>
      </div>
      {dir === "ISSUED" && can.create && (
        <div className="row mt" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void act(async () => {
            const r = await generateCertificates(range.from, range.to);
            if (!r.created) throw new Error("No paid deductions without a certificate in this period");
          }, "Certificates generated as drafts")}><FileText />Generate</button>
          <small className="muted">One draft per vendor / employee and section, from paid deductions.</small>
        </div>
      )}
      {dir === "RECEIVED" && can.create && (
        <div className="row mt"><button type="button" className="btn secondary" onClick={() => setReceiving(true)}><Plus />Record received certificate</button></div>
      )}
      <div className="mt">
        {!rows ? <Skeleton style={{ height: 160 }} /> : !rows.length ? <EmptyState icon={<FileText />} title="No certificates yet" /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Certificate</th><th>Party</th><th>Section</th><th>Period</th><th className="num">Tax</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={selected?.id === c.id ? "selected" : undefined} style={{ cursor: "pointer" }} onClick={() => setSelected(c)}>
                  <td><b>{c.certificateNo}</b>{c.cprNo && <small>CPR {c.cprNo}</small>}</td>
                  <td>{c.party}<small>{c.partyNtnCnic ?? ""}</small></td>
                  <td>{sectionCode(c.whtSection)}</td>
                  <td>{fmtDate(c.periodFrom).slice(3)} – {fmtDate(c.periodTo).slice(3)}</td>
                  <td className="num">{money(c.taxAmount)}</td>
                  <td><Badge tone={CERT_TONE[c.status] ?? "neutral"}>{CERT_LABEL[c.status] ?? c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      {selected && (
        <div className="mt">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <h4 style={{ margin: 0, marginRight: "auto" }}>{selected.certificateNo} · {selected.deductions} deduction{selected.deductions === 1 ? "" : "s"}</h4>
            {selected.direction === "ISSUED" && selected.status === "DRAFT" && can.approve && <button type="button" className="btn primary sm" disabled={busy} onClick={() => void act(() => issueCertificate(selected.id, selected.rowVersion), "Certificate issued")}>Issue</button>}
            {selected.direction === "ISSUED" && selected.status === "ISSUED" && can.export && <button type="button" className="btn secondary sm" onClick={() => void printCertificate(selected.id).catch((e: unknown) => toast(apiMessage(e, "Could not print"), { tone: "danger" }))}><Printer />Print</button>}
            {selected.direction === "RECEIVED" && selected.status === "RECEIVED" && can.approve && <button type="button" className="btn primary sm" disabled={busy} onClick={() => void act(() => claimCertificate(selected.id, selected.rowVersion), "Certificate claimed — its tax is adjustable")}>Claim</button>}
            {selected.status === "DRAFT" && can.edit && <button type="button" className="btn ghost sm" onClick={() => setConfirm("delete")}>Delete</button>}
            {["ISSUED", "RECEIVED", "CLAIMED"].includes(selected.status) && can.approve && <button type="button" className="btn ghost sm" onClick={() => setConfirm("cancel")}>Cancel</button>}
          </div>
          <HistoryTab schema="Tax" table="WhtCertificates" id={selected.id} />
        </div>
      )}
      <ReceiveModal open={receiving} onClose={() => setReceiving(false)} options={options} period={period} onDone={() => { setReceiving(false); setAttempt((n) => n + 1); toast("Certificate recorded", { tone: "good" }); }} />
      <ConfirmDialog open={confirm === "cancel"} onClose={() => setConfirm(null)} busy={busy} danger confirmLabel="Cancel certificate" title={`Cancel ${selected?.certificateNo ?? ""}?`}
        onConfirm={() => selected && void act(() => cancelCertificate(selected.id, selected.rowVersion, "Cancelled from WHT certificates"), "Certificate cancelled")}>
        Its deductions are released (a claimed one becomes unpaid again).
      </ConfirmDialog>
      <ConfirmDialog open={confirm === "delete"} onClose={() => setConfirm(null)} busy={busy} danger confirmLabel="Delete" title={`Delete draft ${selected?.certificateNo ?? ""}?`}
        onConfirm={() => selected && void act(() => deleteCertificate(selected.id, selected.rowVersion), "Draft certificate deleted")}>
        Its deductions can be put on a new certificate.
      </ConfirmDialog>
    </Drawer>
  );
}

function ReceiveModal({ open, onClose, options, period, onDone }: { open: boolean; onClose: () => void; options: TaxOptions | null; period: string; onDone: () => void }) {
  const toast = useToast();
  const q = quarterOf(period);
  const blank = { customerId: "", certificateNo: "", whtSection: "", periodFrom: q.from, periodTo: q.to, receivedOn: today(), cprNo: "" };
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open !== seen) { setSeen(open); if (open) { setF(blank); setErrs({}); } }
  const save = async () => {
    setBusy(true);
    setErrs({});
    try {
      await receiveCertificate({ ...f, whtSection: f.whtSection || null, cprNo: f.cprNo || null });
      onDone();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not record the certificate"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record received certificate" subtitle="Links the customer's withheld tax of the period to this certificate."
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button></>}>
      <FormGrid>
        <Field label="Customer" required error={errs.customerId}>
          <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
            <option value="">Choose…</option>
            {options?.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Certificate number" required error={errs.certificateNo}><input value={f.certificateNo} onChange={(e) => setF({ ...f, certificateNo: e.target.value })} /></Field>
        <Field label="Section" error={errs.whtSection}>
          <select value={f.whtSection} onChange={(e) => setF({ ...f, whtSection: e.target.value })}>
            <option value="">Any</option>
            {options?.sections.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="CPR number" error={errs.cprNo}><input value={f.cprNo} onChange={(e) => setF({ ...f, cprNo: e.target.value })} /></Field>
        <Field label="Period from" required error={errs.periodFrom}><input type="date" value={f.periodFrom} onChange={(e) => setF({ ...f, periodFrom: e.target.value })} /></Field>
        <Field label="Period to" required error={errs.periodTo}><input type="date" value={f.periodTo} onChange={(e) => setF({ ...f, periodTo: e.target.value })} /></Field>
        <Field label="Received on" required error={errs.receivedOn}><input type="date" value={f.receivedOn} onChange={(e) => setF({ ...f, receivedOn: e.target.value })} /></Field>
      </FormGrid>
    </Modal>
  );
}
