"use client";

import Link from "next/link";
import { Clock, KeyRound, PlugZap, Plus, ReceiptText, RefreshCw, RotateCcw, Send, TriangleAlert, Undo2, Wifi, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FbrAuthority, FbrConnectionEvent, FbrSendingState, FbrSetting, FbrSubmission, FbrSubmissionList, HistoryItem } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { whenLabel } from "@/features/access/components/access-ui";
import { getHistory } from "@/features/history/api";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { getFbrSettings, listBranchOptions, saveFbrSettings, type BranchOption } from "@/features/treasury/api";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { fbrEvents, fbrState, listSubmissions, requeueSubmission, retrySubmission, sendBacklog, skipBacklog, syncFbr, testFbr } from "../api";
import { fmtDate, money, SUB_LABEL, SUB_TONE, today } from "./tax-ui";

type Form = {
  environment: "SANDBOX" | "PRODUCTION"; posId: string; apiToken: string; clearToken: boolean; tokenExpiresOn: string; reportOnPosting: boolean; printQr: boolean;
  blockIfUnreachable: boolean; sendingEnabled: boolean; syncIntervalMinutes: string; isActive: boolean; mappings: { id?: string; branchId: string; posId: string; isActive: boolean }[];
};
type Chip = "" | "FAILED" | "PENDING" | "SKIPPED";
const LOOKUPS = ["FbrSettingAuthority", "FbrSettingEnvironment", "ConnectionStatus"];
const PAGE = 10;
const toForm = (s: FbrSetting): Form => ({
  environment: s.environment as Form["environment"], posId: s.posId, apiToken: "", clearToken: false, tokenExpiresOn: s.tokenExpiresOn ?? "",
  reportOnPosting: s.reportOnPosting, printQr: s.printQr, blockIfUnreachable: s.blockIfUnreachable, sendingEnabled: s.sendingEnabled,
  syncIntervalMinutes: String(s.syncIntervalMinutes), isActive: s.isActive,
  mappings: s.mappings.map((m) => ({ id: m.id, branchId: m.branchId ?? "", posId: m.posId, isActive: m.isActive })),
});
const EVENT_TITLE: Record<string, (e: FbrConnectionEvent) => string> = {
  TEST: (e) => (e.ok ? "Connection test OK" : e.details?.startsWith("Not connected") ? "Connection test — not connected" : "Connection test failed"),
  HEALTH_CHECK: (e) => (e.ok ? "Health check OK" : "Health check failed"),
  SYNC: (e) => (e.ok ? "Invoices synced" : "Sync with failures"),
  TIMEOUT: () => "FBR endpoint unreachable",
  RECOVERED: () => "FBR reachable again",
  TOKEN_RENEWED: () => "Token renewed",
  ERROR: () => "FBR error",
};
const docHref = (s: FbrSubmission) => (s.document.kind === "INVOICE" ? `/sales/invoices/${s.document.id}` : "/sales/credit-notes");

/**
 * Template app/tax/fbr (42-acc-reports.html): credentials and behaviour (Phase 5), the invoice sync log, connection
 * history, Test connection / Sync now (Phase 28). Sending is off until "Send documents to FBR" is switched on; until
 * then posted documents wait as Pending and nothing is reported.
 */
export function FbrScreen({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [settings, setSettings] = useState<FbrSetting[] | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<FbrAuthority>("FBR");
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [events, setEvents] = useState<FbrConnectionEvent[] | null>(null);
  const [state, setState] = useState<FbrSendingState | null>(null);
  const [log, setLog] = useState<FbrSubmissionList | null>(null);
  const [chip, setChip] = useState<Chip>("");
  const [page, setPage] = useState(1);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFbrSettings(), listBranchOptions()])
      .then(([s, b]) => { if (!cancelled) { setSettings(s); setBranches(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load FBR settings" }));
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fbrState(tab), fbrEvents(tab), listSubmissions({ authority: tab, status: chip, page, pageSize: PAGE })])
      .then(([st, ev, l]) => { if (!cancelled) { setState(st); setEvents(ev); setLog(l); } })
      .catch(() => { if (!cancelled) { setEvents([]); setLog({ items: [], total: 0, counts: { pending: 0, failed: 0, accepted: 0, skipped: 0 }, month: { accepted: 0, total: 0 } }); } });
    return () => { cancelled = true; };
  }, [tab, chip, page, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = settings?.find((s) => s.authority === tab) ?? null;
  const [prev, setPrev] = useState<FbrSetting | null>(null);
  if (current !== prev) {
    setPrev(current);
    setForm(current ? toForm(current) : null);
    setErrs({});
  }
  useEffect(() => {
    if (!current?.id) return;
    let cancelled = false;
    getHistory("Tax", "FbrSettings", current.id).then((p) => !cancelled && setHistory(p.items)).catch(() => !cancelled && setHistory([]));
    return () => { cancelled = true; };
  }, [current?.id, current?.rowVersion]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const save = async () => {
    if (!form || !current) return;
    setBusy(true);
    setErrs({});
    try {
      const saved = await saveFbrSettings(tab, {
        environment: form.environment, posId: form.posId, ...(form.apiToken.trim() && { apiToken: form.apiToken.trim() }), clearToken: form.clearToken,
        tokenExpiresOn: form.tokenExpiresOn || null, reportOnPosting: form.reportOnPosting, printQr: form.printQr, blockIfUnreachable: form.blockIfUnreachable,
        sendingEnabled: form.sendingEnabled, syncIntervalMinutes: Number(form.syncIntervalMinutes), isActive: form.isActive,
        mappings: form.mappings.map((m) => ({ ...(m.id && { id: m.id }), branchId: m.branchId || null, posId: m.posId, isActive: m.isActive })),
        ...(current.rowVersion !== null && { rowVersion: current.rowVersion }),
      });
      toast(`${tab} settings saved${saved.hasToken ? ` · token ••••${saved.tokenHint}` : ""}${saved.sendingEnabled && !current.sendingEnabled ? " · sending switched on" : ""}`, { tone: "good" });
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the settings"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      toast(await fn(), { tone: "good" });
    } catch (e) {
      toast(apiMessage(e, "Could not complete that"), { tone: "danger" });
    } finally {
      setBusy(false);
      reload();
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const counts = log?.counts;
  const backlog = state?.backlog;
  const timeline = [
    ...(events ?? []).map((e) => ({ at: e.occurredAt, title: (EVENT_TITLE[e.event] ?? (() => e.event))(e), sub: [e.details, e.latencyMs !== null ? `${e.latencyMs} ms` : null, e.actor?.name].filter(Boolean).join(" · "), tone: e.ok ? "good" : "" })),
    ...(history ?? []).filter((h) => h.changes && "apiTokenHint" in h.changes).map((h) => ({ at: h.occurredAt, title: "Token changed", sub: `by ${h.actor.name ?? "system"}`, tone: "" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return (
    <>
      <PageHead
        eyebrow="Tax & Compliance / FBR Integration"
        title="FBR Integration"
        description="Real-time invoice reporting to FBR (POS / Digital Invoicing) and PRA. Posted invoices wait in the queue until sending is switched on."
        actions={canEdit ? (
          <>
            <Button icon={<PlugZap />} disabled={busy || !current?.id} onClick={() => void act(async () => { const r = await testFbr(tab); return r.ok ? `Connection OK · ${r.message}` : `Connection failed · ${r.message}`; })}>Test connection</Button>
            <Button variant="primary" icon={<RefreshCw />} disabled={busy || !current?.id} onClick={() => void act(async () => { const r = await syncFbr(tab); return r.sent ? `Sync done — ${r.accepted} accepted, ${r.failed} failed` : "Nothing due to send"; })}>Sync now</Button>
          </>
        ) : undefined}
      />
      <Tabs items={[{ key: "FBR", label: labelOf(lookups, "FbrSettingAuthority", "FBR") }, { key: "PRA", label: labelOf(lookups, "FbrSettingAuthority", "PRA") }]} active={tab} onChange={(k) => { setTab(k); setPage(1); setChip(""); }} />

      <div className="kpi-grid mt">
        <div className="kpi"><div className="kpi-top"><span>Connection</span><span className="icon-well"><Wifi /></span></div>
          <strong>{!state ? "…" : !state.sendingEnabled ? "Not connected" : state.simulated ? "Simulator" : labelOf(lookups, "ConnectionStatus", state.connectionStatus)}</strong>
          <small>{!state ? "" : !state.configured ? "Not set up" : !state.sendingEnabled ? "Sending is off — documents wait in the queue" : state.simulated ? "Test company · numbers start with SIM-" : `${labelOf(lookups, "FbrSettingEnvironment", current?.environment ?? "SANDBOX")}${current?.tokenExpiresOn ? ` · token valid till ${fmtDate(current.tokenExpiresOn)}` : ""}`}</small>
        </div>
        <div className="kpi teal"><div className="kpi-top"><span>Last sync</span><span className="icon-well"><Clock /></span></div><strong>{state?.lastSyncAt ? whenLabel(state.lastSyncAt) : "—"}</strong><small>{current ? (state?.sendingEnabled ? `Auto every ${current.syncIntervalMinutes} min` : "Starts when sending is on") : ""}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Invoices reported — this month</span><span className="icon-well"><ReceiptText /></span></div><strong>{log ? `${log.month.accepted} / ${log.month.total}` : "…"}</strong><small>{log && log.month.total ? `${Math.round((log.month.accepted / log.month.total) * 100)}% success` : "Nothing queued this month"}</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending / failed</span><span className="icon-well"><TriangleAlert /></span></div><strong>{counts ? `${counts.pending} / ${counts.failed}` : "…"}</strong><small>{counts?.skipped ? `${counts.skipped} not reported` : "In the queue"}</small></div>
      </div>

      {state?.configured && !state.sendingEnabled && backlog && backlog.pending + backlog.failed > 0 && (
        <div className="mt"><Banner tone="info" title={`${backlog.pending + backlog.failed} document(s) waiting — sending to ${tab} is off`}>
          Posted since {fmtDate(backlog.oldest)} (Rs {money(backlog.amount)}). Nothing is reported and no FBR numbers are printed until you enter the credentials and switch on &ldquo;Send documents to {tab}&rdquo;.
        </Banner></div>
      )}
      {state?.sendingEnabled && backlog && backlog.pending + backlog.failed > 0 && canEdit && (
        <div className="mt"><Banner tone="warn" title={`${backlog.pending + backlog.failed} document(s) waiting since ${fmtDate(backlog.oldest)}`}
          action={<div className="row" style={{ gap: 8 }}><Button size="sm" icon={<Send />} disabled={busy} onClick={() => void act(async () => { const r = await sendBacklog(tab); return `${r.sent} sent — ${r.accepted} accepted, ${r.failed} failed`; })}>Send backlog</Button><Button size="sm" disabled={busy} onClick={() => setSkipping(true)}>Mark as not reported…</Button></div>}>
          Documents posted before going live can be sent now, or marked as not reported by date range (they can be re-queued later).
        </Banner></div>
      )}

      <div className="split mt">
        <div className="panel flush">
          <div className="panel-head">
            <div><h3>Invoice sync log</h3><p>Latest submissions to {tab}</p></div>
            <div className="panel-actions"><div className="chips">
              {([["", "All", null], ["FAILED", "Failed", counts?.failed], ["PENDING", "Pending", counts?.pending], ["SKIPPED", "Not reported", counts?.skipped]] as [Chip, string, number | null | undefined][])
                .filter(([k, , n]) => k !== "SKIPPED" || (n ?? 0) > 0)
                .map(([k, l, n]) => <button key={k} type="button" className={chip === k ? "active" : undefined} onClick={() => { setChip(k); setPage(1); }}>{l}{n ? <i>{n}</i> : null}</button>)}
            </div></div>
          </div>
          {!log ? <Skeleton style={{ height: 240 }} /> : !log.items.length ? (
            <EmptyState icon={<ReceiptText />} title={chip ? "Nothing here" : "Nothing reported yet"} description={chip ? "No submissions with this status." : "Posted sales invoices with \"Submit to FBR\" appear here."} />
          ) : (
            <>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Time</th><th>Invoice</th><th>Buyer</th><th className="num">Amount</th><th>FBR invoice no.</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {log.items.map((s) => (
                    <tr key={s.id}>
                      <td>{whenLabel(s.lastAttemptAt ?? s.createdAt)}</td>
                      <td><Link className="link" href={docHref(s)}>{s.document.no}</Link></td>
                      <td>{s.buyerName ?? <span className="muted">Walk-in</span>}</td>
                      <td className="num">{money(s.amount)}</td>
                      <td className={s.fbrInvoiceNo ? "small" : "small muted"}>{s.fbrInvoiceNo ?? "—"}</td>
                      <td><Badge tone={SUB_TONE[s.status] ?? "neutral"}>{SUB_LABEL[s.status] ?? s.status}</Badge>{s.errorMessage && <small>{s.errorMessage}</small>}{s.attempts > 1 && <small>{s.attempts} attempts</small>}</td>
                      <td>
                        {canEdit && s.status === "FAILED" && <button type="button" className="icon-btn-sm" title="Retry now" aria-label="Retry now" disabled={busy} onClick={() => void act(async () => { const r = await retrySubmission(s.id); return r.status === "ACCEPTED" ? `Accepted · ${r.fbrInvoiceNo}` : `Still failing · ${r.errorMessage ?? ""}`; })}><RotateCcw /></button>}
                        {canEdit && s.status === "SKIPPED" && <button type="button" className="icon-btn-sm" title="Put back in the queue" aria-label="Put back in the queue" disabled={busy} onClick={() => void act(async () => { await requeueSubmission(s.id); return "Back in the queue"; })}><Undo2 /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div className="table-foot">
                <span>Showing {log.items.length} of {log.total.toLocaleString("en-US")}</span>
                <div className="pager">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button>
                  <button type="button" className="active">{page}</button>
                  <button type="button" disabled={page * PAGE >= log.total} onClick={() => setPage(page + 1)}>›</button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Credentials</h3><p>Issued by {tab === "FBR" ? "FBR / PRAL" : "PRA"}</p></div>{current && <Badge tone={current.sendingEnabled ? "good" : "neutral"} dot>{!current.id ? "Not set up" : current.sendingEnabled ? "Live" : current.isActive ? "Not sending" : "Disabled"}</Badge>}</div>
            {!form || !current ? <Skeleton style={{ height: 240 }} /> : (
              <>
                {!current.ntn && <Banner tone="warn" title="Company NTN missing">Add the NTN in Company Settings › Company Profile before saving.</Banner>}
                <FormGrid cols={1}>
                  <Field label="Environment" error={errs.environment}>
                    <select value={form.environment} disabled={!canEdit} onChange={(e) => set("environment", e.target.value as Form["environment"])}>
                      <option value="SANDBOX">{labelOf(lookups, "FbrSettingEnvironment", "SANDBOX")}</option>
                      <option value="PRODUCTION">{labelOf(lookups, "FbrSettingEnvironment", "PRODUCTION")}</option>
                    </select>
                  </Field>
                  <Field label="POS ID" required error={errs.posId}><input value={form.posId} disabled={!canEdit} inputMode="numeric" placeholder="e.g. 128734" onChange={(e) => set("posId", e.target.value)} /></Field>
                  <Field label="NTN" hint="From the company profile"><input value={current.ntn} readOnly /></Field>
                  <Field label="STRN" hint="From the company profile"><input value={current.strn ?? ""} readOnly /></Field>
                  <Field label="API security token" error={errs.apiToken} hint={current.hasToken ? `A token ending ••••${current.tokenHint} is saved (encrypted). Leave blank to keep it.` : "Stored encrypted; never shown again after saving."}>
                    <input type="password" autoComplete="new-password" value={form.apiToken} disabled={!canEdit || form.clearToken} placeholder={current.hasToken ? `••••••••••••${current.tokenHint}` : "Paste the token"} onChange={(e) => set("apiToken", e.target.value)} />
                  </Field>
                  {current.hasToken && canEdit && <Switch label="Remove the saved token" checked={form.clearToken} onChange={(e) => set("clearToken", e.target.checked)} />}
                  <Field label="Token valid until" error={errs.tokenExpiresOn}><input type="date" value={form.tokenExpiresOn} disabled={!canEdit} onChange={(e) => set("tokenExpiresOn", e.target.value)} /></Field>
                </FormGrid>
                <div className="form-section"><h4>Branch mapping</h4></div>
                {form.mappings.map((m, i) => (
                  <div key={m.id ?? `n${i}`} className="row" style={{ gap: 8, marginBottom: 8 }}>
                    <select style={{ flex: 1 }} value={m.branchId} disabled={!canEdit} aria-label="Branch" onChange={(e) => set("mappings", form.mappings.map((x, j) => (j === i ? { ...x, branchId: e.target.value } : x)))}>
                      <option value="">All branches</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <span className="muted">→ POS</span>
                    <input style={{ width: 120 }} value={m.posId} disabled={!canEdit} inputMode="numeric" aria-label="POS ID" onChange={(e) => set("mappings", form.mappings.map((x, j) => (j === i ? { ...x, posId: e.target.value } : x)))} />
                    {canEdit && <button type="button" className="icon-btn-sm" aria-label="Remove mapping" onClick={() => set("mappings", form.mappings.filter((_, j) => j !== i))}><X /></button>}
                  </div>
                ))}
                {errs.mappings && <small className="hint text-danger" role="alert">{errs.mappings}</small>}
                {canEdit && <button type="button" className="btn ghost sm" onClick={() => set("mappings", [...form.mappings, { branchId: "", posId: form.posId, isActive: true }])}><Plus />Map a branch</button>}
                <div className="form-section"><h4>Behaviour</h4></div>
                <Switch label={`Send documents to ${tab} (go live)`} checked={form.sendingEnabled} disabled={!canEdit} onChange={(e) => set("sendingEnabled", e.target.checked)} />
                {errs.sendingEnabled && <small className="hint text-danger" role="alert">Enter the POS ID and API token first</small>}
                <Switch label="Report invoices on posting" checked={form.reportOnPosting} disabled={!canEdit} onChange={(e) => set("reportOnPosting", e.target.checked)} />
                <Switch label="Print FBR QR code on invoices" checked={form.printQr} disabled={!canEdit} onChange={(e) => set("printQr", e.target.checked)} />
                <Switch label="Block posting if FBR is unreachable" checked={form.blockIfUnreachable} disabled={!canEdit} onChange={(e) => set("blockIfUnreachable", e.target.checked)} />
                <Switch label={`Use ${tab} reporting`} checked={form.isActive} disabled={!canEdit} onChange={(e) => set("isActive", e.target.checked)} />
                <FormGrid cols={1}><Field label="Sync every (minutes)" error={errs.syncIntervalMinutes}><input inputMode="numeric" value={form.syncIntervalMinutes} disabled={!canEdit} onChange={(e) => set("syncIntervalMinutes", e.target.value)} /></Field></FormGrid>
                {canEdit && (
                  <div className="form-actions">
                    <button type="button" className="btn secondary" onClick={() => { setForm(toForm(current)); setErrs({}); }} disabled={busy}>Cancel</button>
                    <button type="button" className="btn primary" onClick={save} disabled={busy || !current.ntn}><KeyRound />{busy ? "Saving…" : "Save"}</button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><div><h3>Connection history</h3></div></div>
            {!current?.id ? <p className="small muted">Not set up yet.</p> : !events ? <Skeleton style={{ height: 60 }} /> : (
              <div className="timeline">
                {timeline.map((t, i) => (
                  <div key={`${t.at}${i}`} className="tl-item">
                    <span className={t.tone ? `tl-dot ${t.tone}` : "tl-dot"} />
                    <div><b>{t.title}</b><small>{whenLabel(t.at)}{t.sub ? ` · ${t.sub}` : ""}</small></div>
                  </div>
                ))}
                {!timeline.length && <p className="small muted">No connection activity yet.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
      <SkipModal open={skipping} onClose={() => setSkipping(false)} authority={tab} oldest={backlog?.oldest ?? null} onDone={(n) => { setSkipping(false); reload(); toast(`${n} document(s) marked as not reported`, { tone: "good" }); }} />
    </>
  );
}

function SkipModal({ open, onClose, authority, oldest, onDone }: { open: boolean; onClose: () => void; authority: FbrAuthority; oldest: string | null; onDone: (n: number) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ from: oldest ?? today(), to: today() });
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  if (open !== seen) { setSeen(open); if (open) setF({ from: oldest ?? today(), to: today() }); }
  const save = async () => {
    setBusy(true);
    try {
      onDone((await skipBacklog(authority, f.from, f.to)).skipped);
    } catch (e) {
      toast(apiMessage(e, "Could not mark them"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Mark as not reported" subtitle={`Waiting documents dated in this range are not sent to ${authority}.`}
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Mark as not reported"}</button></>}>
      <FormGrid>
        <Field label="From" required><input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" required><input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </FormGrid>
      <p className="small muted mt">Their invoices show &ldquo;Not reported to FBR&rdquo;. You can put any of them back in the queue from the sync log.</p>
    </Modal>
  );
}
