"use client";

import { Bell, BellPlus, Download, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AUDIT_RESULT_FILTERS, type AuditAlertRule, type PlatformAuditLogRow } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminRecordModal } from "@/features/admin-common/components/admin-record-modal";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { createAuditAlertRule, deleteAuditAlertRule, listAuditAlertRules, listPlatformAuditLog, setAuditAlertRuleActive, updateAuditAlertRule } from "../api";
import { Avatar, fmtDateTime } from "./flag-ui";

const PAGE = 25;
const RESULT_TONE: Record<string, string> = { SUCCESS: "good", FAILED: "danger", BLOCKED: "danger", RECORDED: "warn" };
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
type Form = { name: string; actionPattern: string; resultFilter: string; thresholdCount: number; windowMinutes: string; channels: string[]; recipients: string; isActive: boolean };
const blank: Form = { name: "", actionPattern: "", resultFilter: "", thresholdCount: 1, windowMinutes: "", channels: ["EMAIL"], recipients: "", isActive: true };

/**
 * Template admin/audit (30-entry-admin.html ~1006): the activity table is the platform audit log (read-only history,
 * Platform.PlatformAuditLogs); the "Alert rules" drawer lists AuditAlertRules with a template-style create / edit form
 * (the template's "Add rule" was only a toast). Alerts are stored; sending comes with email delivery (Phase 29).
 */
export function AuditScreen() {
  const toast = useToast();
  const [log, setLog] = useState<{ items: PlatformAuditLogRow[]; total: number } | null>(null);
  const [q, setQ] = useState("");
  const [result, setResult] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [rules, setRules] = useState<AuditAlertRule[] | null>(null);
  const [edit, setEdit] = useState<AuditAlertRule | "new" | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<PlatformAuditLogRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      listPlatformAuditLog({ search: q || undefined, result: result || undefined, page, pageSize: PAGE })
        .then((r) => { if (!cancelled) { setLog(r); setError(null); } })
        .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the audit log" }));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, result, page, attempt]);
  const loadRules = useCallback(() => { listAuditAlertRules().then(setRules).catch((e: unknown) => toast(adminErrorMessage(e, "Could not load alert rules"), { tone: "danger" })); }, [toast]);
  useEffect(() => { if (drawer) loadRules(); }, [drawer, loadRules]);

  const open = (r: AuditAlertRule | "new", pattern?: string) => {
    setErrors({});
    setForm(r === "new" ? { ...blank, actionPattern: pattern ?? "" } : { name: r.name, actionPattern: r.actionPattern, resultFilter: r.resultFilter ?? "", thresholdCount: r.thresholdCount, windowMinutes: r.windowMinutes ? String(r.windowMinutes) : "", channels: r.channels, recipients: r.recipients, isActive: r.isActive });
    setEdit(r);
  };
  const save = async () => {
    setBusy(true);
    const body = { ...form, resultFilter: form.resultFilter || null, windowMinutes: form.windowMinutes || null };
    try {
      if (edit === "new") await createAuditAlertRule(body);
      else if (edit) await updateAuditAlertRule(edit.id, { ...body, rowVersion: edit.rowVersion });
      toast(edit === "new" ? "Alert rule added" : "Alert rule saved", { tone: "good" });
      setEdit(null); loadRules();
    } catch (e) {
      setErrors(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the rule"), { tone: "danger" });
    } finally { setBusy(false); }
  };
  const pages = log ? Math.max(1, Math.ceil(log.total / PAGE)) : 1;

  return (
    <>
      <PageHead eyebrow="System / Platform Audit Log" title="Platform audit log" description="Immutable record of every action taken by platform staff and system processes."
        actions={<>
          <button type="button" className="btn secondary" disabled title="CSV export is not built yet"><Download />Export CSV</button>
          <button type="button" className="btn secondary" onClick={() => setDrawer(true)}><Bell />Alert rules</button>
        </>} />

      <div className="panel flush">
        <div className="panel-head"><div><h3>Activity</h3><p>{log ? `${log.total.toLocaleString()} events` : "Loading…"}</p></div></div>
        <div className="toolbar">
          <label className="search-field"><Search /><input placeholder="Search action, actor, IP…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></label>
          <div className="chips">
            <button type="button" className={cn(!result && "active")} onClick={() => { setResult(""); setPage(1); }}>All</button>
            {AUDIT_RESULT_FILTERS.map((r) => <button key={r} type="button" className={cn(result === r && "active")} onClick={() => { setResult(r); setPage(1); }}>{cap(r)}</button>)}
          </div>
        </div>
        {error ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Tenant</th><th>Details</th><th>IP address</th><th>Result</th></tr></thead>
            <tbody>
              {!log ? [0, 1, 2].map((i) => <tr key={i}><td colSpan={7}><Skeleton style={{ height: 24 }} /></td></tr>) : log.items.length === 0 ? (
                <tr><td colSpan={7}><EmptyState title="No events" description="Nothing matches this filter." /></td></tr>
              ) : log.items.map((r) => (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => setDetail(r)}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.occurredAt)}</td>
                  <td>{(() => {
                    // "Super Admin someone@x" (history label) → name + email on two lines, as the template prints name + role.
                    const m = r.actorDetail ? null : /^(.*\S)\s+(\S+@\S+)$/.exec(r.actorLabel);
                    const name = m ? m[1] : r.actorLabel;
                    return <div className="cell-user"><Avatar name={name} size="sm" /><div><b>{name}</b><small>{r.actorDetail ?? m?.[2] ?? ""}</small></div></div>;
                  })()}</td>
                  <td><code>{r.action}</code></td>
                  <td>{r.tenantCode ?? "—"}</td>
                  <td title={r.details ?? undefined} style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.details ?? "—"}</td>
                  <td>{r.ipAddress ?? "—"}</td>
                  <td><span className={cn("badge", RESULT_TONE[r.result] ?? "neutral")}>{cap(r.result)}</span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <div className="table-foot"><span>{log ? `Showing ${log.items.length ? (page - 1) * PAGE + 1 : 0}–${(page - 1) * PAGE + log.items.length} of ${log.total.toLocaleString()} events` : ""}</span>
          <div className="pager"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><button type="button" className="active">{page}</button><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></div></div>
      </div>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Alert rules" subtitle="Notify the security channel when these happen"
        foot={<button type="button" className="btn primary" onClick={() => open("new")}>Add rule</button>}>
        {!rules ? <Skeleton style={{ height: 120 }} /> : rules.length === 0 ? <EmptyState icon={<ShieldAlert />} title="No alert rules" description="Alerts are stored now and sent once email delivery is on (Phase 29)." /> : (
          <div className="list">
            {rules.map((r) => (
              <div key={r.id} className="list-item">
                <span className={cn("icon-well", r.isActive ? (r.resultFilter === "FAILED" || r.resultFilter === "BLOCKED" ? "red" : "yellow") : "")}><ShieldAlert /></span>
                <div role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => open(r)} onKeyDown={(e) => e.key === "Enter" && open(r)}>
                  <b>{r.name}</b><small>{r.channels.map(cap).join(" + ")} · {r.recipients} · <code>{r.actionPattern}</code>{r.thresholdCount > 1 ? ` ×${r.thresholdCount} in ${r.windowMinutes} min` : ""}</small>
                </div>
                <span className="spacer" />
                <label className="switch"><input type="checkbox" checked={r.isActive} aria-label={`${r.name} active`}
                  onChange={(e) => setAuditAlertRuleActive(r.id, e.target.checked, r.rowVersion).then(loadRules).catch((err: unknown) => toast(adminErrorMessage(err, "Could not update the rule"), { tone: "danger" }))} /><i /></label>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.action ?? ""} subtitle={detail ? fmtDateTime(detail.occurredAt) : ""}
        foot={<button type="button" className="btn primary" onClick={() => { const a = detail?.action; setDetail(null); setDrawer(true); open("new", a); }}><BellPlus />Alert on this</button>}>
        {detail && <div className="dl">
          <div><span>Actor</span><b>{detail.actorLabel}</b></div><div><span>Action</span><b><code>{detail.action}</code></b></div><div><span>Tenant</span><b>{detail.tenantCode ?? "—"}</b></div>
          <div><span>Details</span><b>{detail.details ?? "—"}</b></div><div><span>IP address</span><b>{detail.ipAddress ?? "—"}</b></div><div><span>Result</span><b>{cap(detail.result)}</b></div>
        </div>}
      </Drawer>

      <AdminRecordModal open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New alert rule" : "Edit alert rule"} subtitle="Matches platform audit actions; * is a wildcard"
        history={edit && edit !== "new" ? { table: "AuditAlertRules", id: edit.id } : null} busy={busy} saveLabel={edit === "new" ? "Add rule" : "Save rule"} onSave={save}
        onDelete={edit && edit !== "new" ? async () => { try { await deleteAuditAlertRule(edit.id); toast("Alert rule deleted", { tone: "warn" }); setEdit(null); loadRules(); } catch (e) { toast(adminErrorMessage(e, "Could not delete the rule"), { tone: "danger" }); } } : undefined}
        deleteNote="The rule stops alerting. Its history is kept.">
        <div className="form-grid">
          <label className="full"><span>Name *</span><input value={form.name} placeholder="e.g. 3 failed MFA attempts" onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />{errors.name && <small className="hint text-danger">{errors.name}</small>}</label>
          <label><span>Action *</span><input value={form.actionPattern} className="ff-mono-in" placeholder="auth.login, impersonation.*" onChange={(e) => setForm({ ...form, actionPattern: e.target.value })} aria-invalid={!!errors.actionPattern} />{errors.actionPattern && <small className="hint text-danger">{errors.actionPattern}</small>}</label>
          <label><span>Result</span><select value={form.resultFilter} onChange={(e) => setForm({ ...form, resultFilter: e.target.value })}><option value="">Any result</option>{AUDIT_RESULT_FILTERS.map((r) => <option key={r} value={r}>{cap(r)}</option>)}</select></label>
          <label><span>At least (events)</span><input type="number" min={1} value={form.thresholdCount} onChange={(e) => setForm({ ...form, thresholdCount: Number(e.target.value) })} aria-invalid={!!errors.thresholdCount} />{errors.thresholdCount && <small className="hint text-danger">{errors.thresholdCount}</small>}</label>
          <label><span>Within (minutes)</span><input type="number" min={1} value={form.windowMinutes} placeholder="—" onChange={(e) => setForm({ ...form, windowMinutes: e.target.value })} aria-invalid={!!errors.windowMinutes} />{errors.windowMinutes && <small className="hint text-danger">{errors.windowMinutes}</small>}</label>
          <div className="full"><span className="ap-lbl">Channels *</span>
            <div className="ap-chipsel">{["EMAIL", "SLACK"].map((c) => <button key={c} type="button" className={cn(form.channels.includes(c) && "on")} onClick={() => setForm({ ...form, channels: form.channels.includes(c) ? form.channels.filter((x) => x !== c) : [...form.channels, c] })}>{cap(c)}</button>)}</div>
            {errors.channels && <small className="hint text-danger">{errors.channels}</small>}</div>
          <label className="full"><span>Recipients *</span><input value={form.recipients} placeholder="Super Admins, #security-alerts" onChange={(e) => setForm({ ...form, recipients: e.target.value })} aria-invalid={!!errors.recipients} />{errors.recipients && <small className="hint text-danger">{errors.recipients}</small>}</label>
          <label className="check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
        </div>
      </AdminRecordModal>
    </>
  );
}
