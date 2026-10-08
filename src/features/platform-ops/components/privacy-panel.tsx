"use client";

import { Award, Check, Download, History, Plus, Scale, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ConfigTenantOption, PrivacyRequest } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { listConfigTenants } from "@/features/platform-config/api";
import { TenantLogo } from "@/features/platform-tenants/components/tenant-ui";
import {
  approvePrivacyRequest, createPrivacyRequest, fulfilPrivacyRequest, listPrivacyRequests, privacyExportUrl, rejectPrivacyRequest, verifyPrivacyRequest,
} from "../api";
import { fmtDay, useLoad } from "./ops-ui";

const STEPS = ["Received", "Verified", "Approved", "Processing", "Done"];
const STEP_IDX: Record<string, number> = { RECEIVED: 0, VERIFIED: 1, APPROVED: 2, PROCESSING: 3, DONE: 4, REJECTED: 0 };

/**
 * Template admin/security "Privacy requests" table (9B-admin-plus.js 1883–1912): workflow steps, SLA bar, Verify /
 * Approve / Reject, the deletion confirmation (type the company code) and the certificate. Phase 43 adds "New request",
 * Run (export / erasure) and the export download (7 days).
 */
export function PrivacyPanel() {
  const toast = useToast();
  const { data, error, reload } = useLoad(listPrivacyRequests, "Could not load privacy requests");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [approve, setApprove] = useState<PrivacyRequest | null>(null);
  const [erase, setErase] = useState<PrivacyRequest | null>(null);
  const [reject, setReject] = useState<PrivacyRequest | null>(null);
  const [history, setHistory] = useState<PrivacyRequest | null>(null);
  const items = data?.items ?? [];
  const running = items.some((r) => r.step === "PROCESSING");

  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, { tone: "good" }); reload(); return true; }
    catch (e) { toast(adminErrorMessage(e, "Could not update the request"), { tone: "danger", ms: 7000 }); return false; }
    finally { setBusy(false); }
  };

  return (
    <div className="panel flush">
      <div className="panel-head"><div><h3>Privacy requests</h3><p>Tenant data export and deletion. Statutory deadline: 30 days. Deletion needs two approvers.</p></div>
        <div className="panel-actions"><span className="pill"><Scale />PECA 2016 · PDPB 2023 draft</span><button type="button" className="btn secondary sm" onClick={() => setCreating(true)}><Plus />New request</button></div></div>
      {error ? <ErrorState message={error.message} reference={error.reference} onRetry={reload} /> : !data ? <Skeleton style={{ height: 120 }} /> : items.length === 0 ? (
        <EmptyState icon={<Scale />} title="No privacy requests" description="Export and deletion requests from companies appear here." />
      ) : (
        <div className="table-wrap"><table className="tbl ap-prvtbl">
          <thead><tr><th>Request</th><th>Type</th><th>Requested by</th><th>Due</th><th>Workflow</th><th /></tr></thead>
          <tbody>
            {items.map((r) => {
              const done = r.step === "DONE", rejected = r.step === "REJECTED";
              const left = r.daysLeft ?? 0;
              const tone = done ? "good" : left <= 3 ? "danger" : left <= 10 ? "warn" : "good";
              const step = STEP_IDX[r.step] ?? 0;
              return (
                <tr key={r.id}>
                  <td><div className="cell-user"><TenantLogo name={r.tenantName} /><div><b>{r.docNo}</b><small>{r.tenantName} · {r.tenantCode}</small></div></div></td>
                  <td><span className={cn("badge", r.requestType === "DELETE" ? "danger" : "info")}>{r.requestType === "DELETE" ? <Trash2 /> : <Download />}{r.requestType === "DELETE" ? "Delete" : "Export"}</span></td>
                  <td>{r.requestedByName}{r.requestedByRole ? ` (${r.requestedByRole})` : ""}<small>Received {fmtDay(r.receivedOn)}</small></td>
                  <td>{done ? <><span className="ap-good-t"><b>Completed</b></span><small>{r.completedAt && r.completedAt.slice(0, 10) <= r.dueOn ? "within SLA" : "after the due date"}</small></>
                    : rejected ? <span className="muted">Rejected</span>
                    : <div className={cn("ap-due", tone)}><b>{left < 0 ? `${-left} day${left === -1 ? "" : "s"} overdue` : `${left} day${left === 1 ? "" : "s"} left`}</b><div className={cn("ap-bar thin", tone)}><i style={{ ["--w" as string]: `${Math.max(0, Math.min(100, (left / 30) * 100))}%` }} /></div></div>}</td>
                  <td>{rejected ? <small className="text-danger" title={r.rejectedReason ?? ""}>Rejected: {r.rejectedReason}</small> : (
                    <div className="ap-wfsteps">{STEPS.map((s, k) => <span key={s} className={cn(k < step || done ? "done" : k === step ? "cur" : "")} title={`${s}${s === "Approved" && r.requestType === "DELETE" ? ` · ${r.approvals}/2 approvers` : ""}`}><i /></span>)}
                      <small>{STEPS[step]}{r.requestType === "DELETE" && r.step === "VERIFIED" ? ` · ${r.approvals}/2 approvals` : ""}{r.decisionNote?.startsWith("SOLO APPROVAL:") ? " · solo approval" : ""}</small></div>
                  )}</td>
                  <td className="actions">
                    <div className="row ap-nowrap">
                      {r.step === "RECEIVED" && <button type="button" className="btn primary sm" disabled={busy} onClick={() => act(() => verifyPrivacyRequest(r.id), `${r.docNo} identity verified`)}><Check />Verify</button>}
                      {r.step === "VERIFIED" && <button type="button" className="btn primary sm" disabled={busy} onClick={() => (r.requestType === "DELETE" ? setApprove(r) : void act(() => approvePrivacyRequest(r.id, {}), `${r.docNo} approved`))}><Check />Approve</button>}
                      {r.step === "APPROVED" && <button type="button" className={cn("btn sm", r.requestType === "DELETE" ? "danger solid" : "primary")} disabled={busy}
                        onClick={() => (r.requestType === "DELETE" ? setErase(r) : void act(() => fulfilPrivacyRequest(r.id), `Export for ${r.tenantName} started`))}>{r.requestType === "DELETE" ? <><Trash2 />Erase data</> : <><Download />Run export</>}</button>}
                      {r.step === "PROCESSING" && <span className="ap-muted-t"><span className="ap-spin ap-inl" />Running…</span>}
                      {["RECEIVED", "VERIFIED", "APPROVED"].includes(r.step) && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setReject(r)}>Reject</button>}
                      {done && r.exportAvailable && <a className="btn ghost sm" href={privacyExportUrl(r.id)}><Download />Export</a>}
                      {done && <Link className="btn ghost sm" href={`/admin/security/${r.id}`}><Award />Certificate</Link>}
                      <button type="button" className="icon-btn-sm" aria-label="History" onClick={() => setHistory(r)}><History /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); reload(); toast(`${r.docNo} received · due ${fmtDay(r.dueOn)}`, { tone: "good" }); }} />}
      {approve && <ApproveDeleteModal r={approve} solo={data?.solo ?? false} busy={busy} onClose={() => setApprove(null)}
        onConfirm={async (code, note) => { if (await act(() => approvePrivacyRequest(approve.id, { confirmCode: code, ...(note ? { note } : {}) }), `Approval recorded for ${approve.docNo}`)) setApprove(null); }} />}
      {erase && <EraseModal r={erase} busy={busy} onClose={() => setErase(null)}
        onConfirm={async (code) => { if (await act(() => fulfilPrivacyRequest(erase.id, code), `${erase.tenantName} personal data erased · certificate issued`)) setErase(null); }} />}
      {reject && <RejectModal r={reject} busy={busy} onClose={() => setReject(null)} onConfirm={async (reason) => { if (await act(() => rejectPrivacyRequest(reject.id, reason), `${reject.docNo} rejected`)) setReject(null); }} />}
      <Modal open={!!history} onClose={() => setHistory(null)} title="Privacy request history" subtitle={history?.docNo} wide>
        {history && <AdminHistoryTab table="PrivacyRequests" id={history.id} />}
      </Modal>
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: (r: PrivacyRequest) => void }) {
  const toast = useToast();
  const [tenants, setTenants] = useState<ConfigTenantOption[]>([]);
  const [f, setF] = useState({ tenantId: "", requestType: "EXPORT", requestedByName: "", requestedByRole: "Owner", requesterEmail: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { listConfigTenants().then(setTenants).catch(() => setTenants([])); }, []);
  const submit = async () => {
    setBusy(true);
    try { onDone(await createPrivacyRequest(f)); }
    catch (e) { setErrs(adminFieldErrors(e)); toast(adminErrorMessage(e, "Could not record the request"), { tone: "danger", ms: 6000 }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="New privacy request" subtitle="A company asks for its data, or for its personal data to be erased"
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={submit}><Plus />{busy ? "Saving…" : "Record request"}</button></>}>
      <div className="form-grid">
        <label className="full"><span>Company *</span><select value={f.tenantId} onChange={(e) => setF({ ...f, tenantId: e.target.value })} aria-invalid={!!errs.tenantId}>
          <option value="">Choose a company…</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}</select>{errs.tenantId && <small className="hint text-danger">{errs.tenantId}</small>}</label>
        <label><span>Type</span><select value={f.requestType} onChange={(e) => setF({ ...f, requestType: e.target.value })}><option value="EXPORT">Export (data copy)</option><option value="DELETE">Delete (right to be forgotten)</option></select></label>
        <label><span>Role</span><input value={f.requestedByRole} onChange={(e) => setF({ ...f, requestedByRole: e.target.value })} /></label>
        <label><span>Requested by *</span><input value={f.requestedByName} onChange={(e) => setF({ ...f, requestedByName: e.target.value })} aria-invalid={!!errs.requestedByName} />{errs.requestedByName && <small className="hint text-danger">{errs.requestedByName}</small>}</label>
        <label><span>Email</span><input type="email" value={f.requesterEmail} onChange={(e) => setF({ ...f, requesterEmail: e.target.value })} /></label>
      </div>
      {f.requestType === "DELETE" && <p className="small text-danger">A deletion irreversibly anonymises the company&apos;s personal data, disables every login and closes the company. Financial records are kept with names replaced.</p>}
    </Modal>
  );
}

function ApproveDeleteModal({ r, solo, busy, onClose, onConfirm }: { r: PrivacyRequest; solo: boolean; busy: boolean; onClose: () => void; onConfirm: (code: string, note: string) => void }) {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const ok = code.trim().toLowerCase() === r.tenantCode.toLowerCase() && (!solo || note.trim().length > 0);
  return (
    <ConfirmDialog open onClose={onClose} danger busy={busy} title={`Approve deletion for ${r.tenantName}?`} confirmLabel={solo ? "Approve (solo)" : r.approvals ? "Approve 2 of 2" : "Approve 1 of 2"}
      onConfirm={() => ok && onConfirm(code.trim(), note.trim())}>
      <p>Personal data of this company (users, employees, contacts, addresses, phones, emails, CNICs) will be irreversibly anonymised after approval. Invoices, vouchers and tax records are kept with names replaced; logins are disabled and the company is closed.</p>
      {solo && <p className="small"><b>Solo approval.</b> You are the only platform admin: one approval with a note counts as both approvers and is recorded as a solo approval.</p>}
      <label className="field"><span>Type <b className="ff-mono">{r.tenantCode}</b> to confirm</span><input autoComplete="off" spellCheck={false} value={code} placeholder={r.tenantCode} onChange={(e) => setCode(e.target.value)} /></label>
      {solo && <label className="field"><span>Note *</span><textarea rows={2} value={note} placeholder="Identity checked, request letter on file…" onChange={(e) => setNote(e.target.value)} /></label>}
      {!ok && <small className="muted">{solo ? "Type the code and a note to enable the approval." : "Type the code to enable the approval."}</small>}
    </ConfirmDialog>
  );
}

function EraseModal({ r, busy, onClose, onConfirm }: { r: PrivacyRequest; busy: boolean; onClose: () => void; onConfirm: (code: string) => void }) {
  const [code, setCode] = useState("");
  const ok = code.trim().toLowerCase() === r.tenantCode.toLowerCase();
  return (
    <ConfirmDialog open onClose={onClose} danger busy={busy} title={`Erase ${r.tenantName}'s personal data now?`} confirmLabel="Erase permanently" onConfirm={() => ok && onConfirm(code.trim())}>
      <p><b>This cannot be undone.</b> The anonymisation runs now, every session is ended, the subscription is cancelled and the company is closed. A completion certificate is issued.</p>
      <label className="field"><span>Type <b className="ff-mono">{r.tenantCode}</b> to confirm</span><input autoComplete="off" spellCheck={false} value={code} placeholder={r.tenantCode} onChange={(e) => setCode(e.target.value)} /></label>
    </ConfirmDialog>
  );
}

function RejectModal({ r, busy, onClose, onConfirm }: { r: PrivacyRequest; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog open onClose={onClose} danger busy={busy} title={`Reject ${r.docNo}?`} confirmLabel="Reject" onConfirm={() => reason.trim().length >= 3 && onConfirm(reason.trim())}>
      <p>The requester is told why and can submit again with more proof of identity.</p>
      <label className="field"><span>Reason *</span><textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </ConfirmDialog>
  );
}
