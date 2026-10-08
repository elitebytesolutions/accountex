"use client";

import { ArrowLeft, Award, Printer } from "lucide-react";
import Link from "next/link";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { privacyCertificate } from "../api";
import { fmtDay, fmtWhen, useLoad } from "./ops-ui";

const fmtBytes = (n: number | undefined) => (n === undefined ? "—" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Completion certificate of a privacy request (print view; template "Certificate" button of the privacy table). */
export function CertificateScreen({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => privacyCertificate(id), "Could not load the certificate");
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!data) return <Skeleton style={{ height: 400 }} />;
  const r = data.request, s = r.summary;
  const erase = r.requestType === "DELETE";
  return (
    <>
      <PageHead eyebrow="System / Security & Privacy" title={`Certificate ${r.certificateRef}`} description={`${erase ? "Data erasure" : "Data export"} for ${r.tenantName}`}
        actions={<><Link className="btn secondary" href="/admin/security"><ArrowLeft />Security &amp; Privacy</Link><button type="button" className="btn primary" onClick={() => window.print()}><Printer />Print / PDF</button></>} />
      <div className="panel" style={{ maxWidth: 820 }}>
        <div className="panel-head"><div><h3><Award /> Certificate of {erase ? "erasure" : "data export"}</h3><p>{r.certificateRef} · issued {fmtWhen(data.issuedAt)} PKT</p></div></div>
        <div className="dl">
          <div><span>Company</span><b>{r.tenantName} ({r.tenantCode})</b></div>
          <div><span>Request</span><b>{r.docNo} · {erase ? "Right to be forgotten" : "Data export"}</b></div>
          <div><span>Requested by</span><b>{r.requestedByName}{r.requestedByRole ? `, ${r.requestedByRole}` : ""}{r.requesterEmail ? ` · ${r.requesterEmail}` : ""}</b></div>
          <div><span>Received / due</span><b>{fmtDay(r.receivedOn)} / {fmtDay(r.dueOn)}</b></div>
          <div><span>Verified by</span><b>{r.verifiedBy ?? "—"} · {fmtWhen(r.verifiedAt)}</b></div>
          <div><span>Approved by</span><b>{r.approver1 ?? "—"}{r.approver2 && r.approver2 !== r.approver1 ? ` and ${r.approver2}` : ""}{r.decisionNote?.startsWith("SOLO APPROVAL:") ? " (solo approval)" : ""}</b></div>
          {r.decisionNote && <div><span>Approval note</span><b>{r.decisionNote}</b></div>}
          <div><span>Completed</span><b>{fmtWhen(r.completedAt)} PKT{r.completedAt && r.completedAt.slice(0, 10) <= r.dueOn ? " · within the 30-day deadline" : ""}</b></div>
          {erase ? <>
            <div><span>Outcome</span><b>Personal data anonymised irreversibly · {s?.sessionsRevoked ?? 0} {(s?.sessionsRevoked ?? 0) === 1 ? "session" : "sessions"} ended · company {s?.companyStatus?.toLowerCase() ?? "closed"}</b></div>
            <div><span>Records touched</span><b>{s?.rowsTouched ?? 0} rows in {s?.tables?.length ?? 0} tables · {s?.historyEntriesScrubbed ?? 0} history entries scrubbed</b></div>
          </> : <>
            <div><span>Export</span><b>{s?.backupCode ?? "—"} · {s?.format ?? "JSON"} · {fmtBytes(s?.sizeBytes)}</b></div>
            <div><span>Download available until</span><b>{fmtWhen(r.exportLinkExpiresAt)} PKT</b></div>
          </>}
          <div><span>Issued by</span><b>{data.issuedBy}, Accountex platform</b></div>
        </div>
        {erase && s?.tables && (
          <div className="table-wrap" style={{ marginTop: 16 }}><table className="tbl">
            <thead><tr><th>Table</th><th>Columns anonymised</th><th className="num">Rows</th></tr></thead>
            <tbody>{s.tables.filter((t) => t.rows > 0).map((t) => <tr key={`${t.schema}.${t.table}`}><td>{t.schema}.{t.table}</td><td className="small" style={{ whiteSpace: "normal", minWidth: 220 }}>{t.columns.join(", ")}</td><td className="num">{t.rows}</td></tr>)}</tbody>
          </table></div>
        )}
        {erase && <p className="small muted" style={{ marginTop: 12 }}>Invoices, vouchers and tax records are retained for the statutory period with personal names replaced. Every login of the company is disabled.</p>}
      </div>
    </>
  );
}
