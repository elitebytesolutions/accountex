"use client";

import { Building2, Check, CircleAlert, CodeXml, Copy, KeyRound, Plus, RotateCcw, RotateCw, Send, Timer, Trash2, TriangleAlert, Webhook } from "lucide-react";
import { useState } from "react";
import {
  API_KEY_ROTATION_GRACE_HOURS, API_SCOPES, WEBHOOK_EVENTS, WEBHOOK_URL,
  type ApiKey, type ApiKeyCreate, type WebhookDelivery, type WebhookEndpoint,
} from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, FormGrid } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import {
  createApiKey, createWebhook, deleteWebhook, listApiKeys, listConfigTenants, listTenantDeliveries, listWebhooks, replayDelivery, revokeApiKey, rotateApiKey, testWebhook, updateWebhook,
} from "../api";
import { copyText, fmtDateTime, fmtDay, useLoad } from "./config-ui";

const codeBadge = (d: WebhookDelivery) => {
  if (d.status === "TIMEOUT") return <span className="ap-code err">Timeout</span>;
  if (d.responseCode === null) return <span className="ap-code err">No response</span>;
  return <span className={`ap-code ${d.responseCode < 300 ? "ok" : d.responseCode < 500 ? "warn" : "err"}`}>{d.responseCode}</span>;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Shows a just-created secret once, with copy (template .ap-newkey). */
function SecretOnce({ secret, what }: { secret: string; what: string }) {
  const toast = useToast();
  return (
    <div className="ap-newkey">
      <small>Copy it now. You will not see it again.</small>
      <div className="row"><code className="code">{secret}</code>
        <button type="button" className="btn primary sm" onClick={async () => toast((await copyText(secret)) ? `${what} copied` : "Could not copy", { tone: "info" })}><Copy />Copy</button></div>
    </div>
  );
}

/**
 * Super Admin › System › API & Webhooks (template admin/integrations, 3A-admin-plus.html:159 + 9B-admin-plus.js 2077+):
 * per-tenant API keys (shown once, stored as sha-256, rotate with a 24 h grace, revoke), webhook endpoints (signed test
 * events) and the delivery log with replay. API traffic KPIs need an API gateway (not built yet).
 */
export function IntegrationsScreen() {
  const toast = useToast();
  const tenants = useLoad(listConfigTenants, "Could not load tenants");
  const [tenantId, setTenantId] = useState("");
  const tid = tenantId || tenants.data?.[0]?.id || "";
  const tenantName = tenants.data?.find((t) => t.id === tid)?.name ?? "";
  const keys = useLoad(() => (tid ? listApiKeys(tid) : Promise.resolve([] as ApiKey[])), "Could not load API keys", [tid]);
  const hooks = useLoad(() => (tid ? listWebhooks(tid) : Promise.resolve([] as WebhookEndpoint[])), "Could not load webhooks", [tid]);
  const log = useLoad(() => (tid ? listTenantDeliveries(tid) : Promise.resolve([] as WebhookDelivery[])), "Could not load deliveries", [tid]);
  const [keyModal, setKeyModal] = useState<{ rotate?: ApiKey } | null>(null);
  const [hookModal, setHookModal] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [removing, setRemoving] = useState<WebhookEndpoint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lf, setLf] = useState<"all" | "ok" | "err">("all");
  const [selLog, setSelLog] = useState<string | null>(null);
  const [pv, setPv] = useState<"req" | "res">("req");

  const deliveries = (log.data ?? []).filter((d) => lf === "all" || (lf === "ok" ? d.status === "DELIVERED" : d.status !== "DELIVERED"));
  const sel = log.data?.find((d) => d.id === selLog) ?? log.data?.[0] ?? null;
  const all = log.data ?? [];
  const okRate = all.length ? Math.round((all.filter((d) => d.status === "DELIVERED").length / all.length) * 1000) / 10 : null;

  const act = async (id: string, fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(id);
    try {
      await fn();
      toast(ok, { tone: "good" });
      return true;
    } catch (e) {
      toast(adminErrorMessage(e, fail), { tone: "danger" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const afterDelivery = (d: WebhookDelivery, what: string) => {
    toast(`${what} · ${d.status === "DELIVERED" ? `${d.responseCode} OK in ${d.latencyMs} ms` : d.status === "TIMEOUT" ? "timed out after 10 s" : `failed${d.responseCode ? ` (${d.responseCode})` : ""}`}`,
      { tone: d.status === "DELIVERED" ? "good" : "danger" });
    setSelLog(d.id); setLf("all");
    log.reload(); hooks.reload();
  };
  const ping = async (h: WebhookEndpoint) => {
    setBusy(h.id);
    try { afterDelivery(await testWebhook(h.id), "Test event sent"); } catch (e) { toast(adminErrorMessage(e, "Could not send the test event"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const replay = async (d: WebhookDelivery) => {
    setBusy(d.id);
    try { afterDelivery(await replayDelivery(d.id), `${d.eventType} replayed`); } catch (e) { toast(adminErrorMessage(e, "Could not replay the event"), { tone: "danger" }); } finally { setBusy(null); }
  };

  return (
    <>
      <PageHead eyebrow="System / API & Webhooks" title="API & Webhooks" description="Per-tenant API keys and scopes, webhook endpoints and every delivery with replay."
        actions={<>
          <label className="ap-tenant-pick"><Building2 /><select value={tid} onChange={(e) => { setTenantId(e.target.value); setSelLog(null); }} aria-label="Tenant">
            {(tenants.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <button type="button" className="btn primary" disabled={!tid} onClick={() => setKeyModal({})}><KeyRound />Create API key</button>
        </>} />

      <div className="kpi-grid">
        <div className="kpi blue"><div className="kpi-top"><span>API calls · 24 h</span><span className="icon-well"><CodeXml /></span></div><strong>—</strong><small>Metered by the API gateway (not built yet)</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Error rate</span><span className="icon-well"><CircleAlert /></span></div><strong>—</strong><small>Metered by the API gateway</small></div>
        <div className="kpi"><div className="kpi-top"><span>p95 latency</span><span className="icon-well"><Timer /></span></div><strong>—</strong><small>Metered by the API gateway</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Webhook success</span><span className="icon-well"><Webhook /></span></div>
          <strong>{okRate === null ? "—" : `${okRate}%`}</strong><small>{all.length ? `Last ${all.length} deliveries` : "No deliveries yet"}</small></div>
      </div>

      {tenants.error && <ErrorState message={tenants.error.message} reference={tenants.error.reference} onRetry={tenants.reload} />}
      <div className="panel flush">
        <div className="panel-head"><div><h3>API keys</h3><p>{tenantName} · keys are shown once at creation, then masked</p></div>
          <div className="panel-actions"><button type="button" className="btn secondary sm" disabled={!tid} onClick={() => setKeyModal({})}><Plus />New key</button></div></div>
        {keys.error ? <ErrorState message={keys.error.message} reference={keys.error.reference} onRetry={keys.reload} /> : !keys.data ? <Skeleton style={{ height: 80 }} /> : keys.data.length === 0 ? (
          <EmptyState icon={<KeyRound />} title="No API keys" description={`${tenantName || "This tenant"} has no keys yet.`} />
        ) : (
          <div className="table-wrap"><table className="tbl ap-ktbl">
            <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Last used</th><th /></tr></thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id} className={k.status === "REVOKED" ? "ap-dim" : undefined}>
                  <td><b>{k.name}</b><small><span className={`ap-env ${k.environment === "LIVE" ? "live" : "test"}`}>{k.environment.toLowerCase()}</span>
                    {k.status === "REVOKED" && <> <span className="badge neutral">Revoked {fmtDay(k.revokedAt)}</span></>}
                    {k.previousValidUntil && new Date(k.previousValidUntil) > new Date() && <> <span className="badge warn">Old key valid until {fmtDateTime(k.previousValidUntil)}</span></>}</small></td>
                  <td><div className="ap-keycell"><code className="code ap-key">{k.masked}</code></div>{k.expiresAt && <small>Expires {fmtDay(k.expiresAt)}</small>}</td>
                  <td><div className="ap-scopes">{k.scopes.map((s) => <span key={s} className="ap-scope">{s}</span>)}</div>{k.allowedCidrs.length > 0 && <small>IPs: {k.allowedCidrs.join(", ")}</small>}</td>
                  <td>{fmtDay(k.createdAt)}</td>
                  <td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}</td>
                  <td className="actions">{k.status === "ACTIVE" && <div className="row ap-nowrap">
                    <button type="button" className="btn ghost sm" onClick={() => setKeyModal({ rotate: k })}><RotateCw />Rotate</button>
                    <button type="button" className="icon-btn-sm" aria-label="Revoke" onClick={() => setRevoking(k)}><Trash2 /></button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <div className="ap-hooks-h"><h3>Webhook endpoints</h3><button type="button" className="btn secondary sm" disabled={!tid} onClick={() => setHookModal(true)}><Plus />Add endpoint</button></div>
      {hooks.error && <ErrorState message={hooks.error.message} reference={hooks.error.reference} onRetry={hooks.reload} />}
      {hooks.data && hooks.data.length === 0 && <div className="panel"><EmptyState icon={<Webhook />} title="No webhook endpoints" description="Add an https:// endpoint to receive signed events for this tenant." /></div>}
      <div className="grid-2 ap-hooks">
        {(hooks.data ?? []).map((h) => (
          <div key={h.id} className={cn("panel ap-hookcard", !h.isEnabled && "off")}>
            <div className="ap-hook-top"><span className={cn("icon-tile", h.successRate7d !== null && h.successRate7d <= 95 && "orange")}><Webhook /></span>
              <div><b className="ap-ellip">{h.url}</b><small>{h.successRate7d === null ? "No deliveries in 7 d" : `${h.successRate7d}% success · 7 d`}{!h.isEnabled && h.pausedAt ? ` · paused ${fmtDay(h.pausedAt)}` : ""}</small></div>
              <label className="switch"><input type="checkbox" checked={h.isEnabled} disabled={busy === h.id} aria-label={h.isEnabled ? "Pause endpoint" : "Resume endpoint"}
                onChange={(e) => void act(h.id, () => updateWebhook(h.id, { isEnabled: e.target.checked, rowVersion: h.rowVersion }), e.target.checked ? "Endpoint resumed" : "Endpoint paused", "Could not change the endpoint").then(() => hooks.reload())} /><i /></label></div>
            <div className="ap-secret"><small>Signing secret</small><code className="code">{h.secretMasked}</code></div>
            <div className="ap-evs">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="ap-ev"><input type="checkbox" checked={h.events.includes(ev)} disabled={busy === h.id}
                  onChange={(e) => {
                    const events = e.target.checked ? [...h.events, ev] : h.events.filter((x) => x !== ev);
                    if (!events.length) { toast("Keep at least one event", { tone: "warn" }); return; }
                    void act(h.id, () => updateWebhook(h.id, { events: events as (typeof WEBHOOK_EVENTS)[number][], rowVersion: h.rowVersion }), `${ev} ${e.target.checked ? "subscribed" : "unsubscribed"}`, "Could not save the events").then(() => hooks.reload());
                  }} /><span>{ev}</span></label>
              ))}
            </div>
            <div className="row"><small className="ap-muted-t">{h.events.length} events subscribed</small><span className="spacer" />
              <button type="button" className="icon-btn-sm" aria-label="Delete endpoint" onClick={() => setRemoving(h)}><Trash2 /></button>
              <button type="button" className="btn secondary sm" disabled={busy === h.id} onClick={() => void ping(h)}><Send />{busy === h.id ? "Sending…" : "Send test event"}</button></div>
          </div>
        ))}
      </div>

      <div className="split ap-log-split">
        <div className="panel flush">
          <div className="panel-head"><div><h3>Webhook deliveries</h3><p>Click a row to inspect the payload</p></div>
            <div className="panel-actions"><div className="chips">
              {([["all", "All"], ["ok", "2xx"], ["err", "Failed"]] as const).map(([k, l]) => <button key={k} type="button" className={lf === k ? "active" : undefined} onClick={() => setLf(k)}>{l}</button>)}
            </div></div></div>
          {deliveries.length === 0 ? <EmptyState icon={<Send />} title="No deliveries" description="Send a test event from an endpoint card." /> : (
            <div className="table-wrap"><table className="tbl ap-wtbl">
              <thead><tr><th>Time</th><th>Event</th><th>Endpoint</th><th>Status</th><th className="num">Latency</th><th>Attempt</th><th /></tr></thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className={d.id === sel?.id ? "ap-sel" : undefined} onClick={() => setSelLog(d.id)} style={{ cursor: "pointer" }}>
                    <td className="tnum">{time(d.createdAt)}<small>{fmtDay(d.createdAt)}</small></td>
                    <td><code className="ap-evc">{d.eventType}</code>{d.replayOfId && <small>replay</small>}</td>
                    <td><span className="ap-ellip ap-epw">{d.endpointUrl.replace("https://", "")}</span></td>
                    <td>{codeBadge(d)}</td>
                    <td className="num">{d.latencyMs === null ? "—" : `${d.latencyMs.toLocaleString()} ms`}</td>
                    <td>{d.attemptNo}/6</td>
                    <td className="actions"><button type="button" className={cn("icon-btn-sm", d.status !== "DELIVERED" && "ap-replay-hot")} aria-label="Replay" disabled={busy === d.id}
                      onClick={(e) => { e.stopPropagation(); void replay(d); }}><RotateCcw /></button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
        <div className="panel ap-payload">
          {sel ? (
            <>
              <div className="panel-head"><div><h3>Payload</h3><p><code className="ap-evc">{sel.eventType}</code> · {sel.eventId}</p></div>
                <div className="panel-actions">{codeBadge(sel)}<button type="button" className="icon-btn-sm" aria-label="Copy JSON"
                  onClick={async () => toast((await copyText(JSON.stringify(sel.requestPayload, null, 2))) ? "Payload JSON copied" : "Could not copy", { tone: "info" })}><Copy /></button></div></div>
              <div className="seg ap-mb">
                <button type="button" className={pv === "req" ? "active" : undefined} onClick={() => setPv("req")}>Request</button>
                <button type="button" className={pv === "res" ? "active" : undefined} onClick={() => setPv("res")}>Response</button>
              </div>
              {pv === "req" ? <pre className="code ap-json">{JSON.stringify(sel.requestPayload, null, 2)}</pre> : (
                <pre className="code ap-json">{sel.status === "TIMEOUT" ? "— no response within 10 s —" : `HTTP ${sel.responseCode ?? "—"}\n\n${sel.responseBody ?? ""}`}</pre>
              )}
              <div className="ap-pl-foot"><small>Signed with HMAC-SHA256 (x-accountex-signature: t=…, v1=…)</small>
                <button type="button" className="btn primary sm" disabled={busy === sel.id} onClick={() => void replay(sel)}><RotateCcw />Replay this event</button></div>
            </>
          ) : <EmptyState icon={<CodeXml />} title="No payload selected" description="Deliveries appear here once an event is sent." />}
        </div>
      </div>

      {keyModal && <KeyModal key={keyModal.rotate?.id ?? "new"} tenantId={tid} tenantName={tenantName} rotate={keyModal.rotate} onClose={() => setKeyModal(null)} onDone={keys.reload} />}
      {hookModal && <HookModal tenantId={tid} tenantName={tenantName} onClose={() => setHookModal(false)} onDone={() => { hooks.reload(); }} />}
      <ConfirmDialog open={!!revoking} onClose={() => setRevoking(null)} danger confirmLabel="Revoke key" busy={!!busy} title={`Revoke “${revoking?.name ?? ""}”?`}
        onConfirm={async () => { const k = revoking!; if (await act(k.id, () => revokeApiKey(k.id, k.rowVersion), `${k.name} revoked`, "Could not revoke the key")) { setRevoking(null); keys.reload(); } }}>
        Requests using this key fail immediately with 401. This cannot be undone.
      </ConfirmDialog>
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger confirmLabel="Delete endpoint" busy={!!busy} title="Delete this endpoint?"
        onConfirm={async () => { const h = removing!; if (await act(h.id, () => deleteWebhook(h.id, h.rowVersion), "Endpoint deleted", "Could not delete the endpoint")) { setRemoving(null); hooks.reload(); log.reload(); } }}>
        {removing?.url} stops receiving events and its delivery log is removed (it stays in history).
      </ConfirmDialog>
    </>
  );
}

function KeyModal({ tenantId, tenantName, rotate, onClose, onDone }: { tenantId: string; tenantName: string; rotate?: ApiKey; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [env, setEnv] = useState<"LIVE" | "TEST">("LIVE");
  const [scopes, setScopes] = useState<string[]>(["read:vouchers", "read:invoices"]);
  const [expiry, setExpiry] = useState<ApiKeyCreate["expiry"]>("NEVER");
  const [ips, setIps] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (secret) { onClose(); return; }
    setBusy(true);
    setErrs({});
    try {
      const r = rotate ? await rotateApiKey(rotate.id, rotate.rowVersion) : await createApiKey({
        tenantId, name, environment: env, scopes: scopes as ApiKeyCreate["scopes"], expiry, allowedCidrs: ips.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setSecret(r.secret);
      onDone();
      toast(rotate ? `${rotate.name} rotated · old key expires in ${API_KEY_ROTATION_GRACE_HOURS} h` : `Key “${r.key.name}” created`, { tone: "good" });
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, rotate ? "Could not rotate the key" : "Could not create the key"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={rotate ? `Rotate “${rotate.name}”` : "Create API key"} subtitle={`${tenantName} · keys are shown once`}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>{secret ? "Close" : "Cancel"}</button>
        <button type="button" className={cn("btn", secret ? "secondary" : rotate ? "danger solid" : "primary")} disabled={busy} onClick={go}>
          {secret ? <><Check />Done</> : rotate ? <><RotateCw />Rotate key</> : <><KeyRound />Create key</>}</button></>}>
      {rotate ? (
        <div className="banner warn"><TriangleAlert /><div><b>The old key keeps working for {API_KEY_ROTATION_GRACE_HOURS} hours</b>
          <p>Update {rotate.name} with the new key before then. After that, requests with the old key get 401.</p></div></div>
      ) : !secret && (
        <>
          <FormGrid>
            <Field label="Name" required error={errs.name}><input value={name} maxLength={80} placeholder="e.g. Shopify order sync" autoFocus onChange={(e) => setName(e.target.value)} /></Field>
            <div className="field"><span>Environment</span><div className="seg">
              <button type="button" className={env === "LIVE" ? "active" : undefined} onClick={() => setEnv("LIVE")}>Live</button>
              <button type="button" className={env === "TEST" ? "active" : undefined} onClick={() => setEnv("TEST")}>Test</button></div></div>
          </FormGrid>
          <div className="ap-lbl ap-mt">Scopes</div>
          <div className="ap-evs">{API_SCOPES.map((s) => (
            <label key={s} className="ap-ev"><input type="checkbox" checked={scopes.includes(s)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s] : scopes.filter((x) => x !== s))} /><span>{s}</span></label>
          ))}</div>
          {errs.scopes && <small className="hint text-danger" role="alert">{errs.scopes}</small>}
          <div className="form-grid ap-mt">
            <Field label="Expires"><select value={expiry} onChange={(e) => setExpiry(e.target.value as ApiKeyCreate["expiry"])}>
              <option value="NEVER">Never</option><option value="DAYS_90">90 days</option><option value="YEAR_1">1 year</option></select></Field>
            <Field label="Allowed IPs (optional)" error={errs.allowedCidrs} hint="Comma-separated IPv4 CIDRs"><input value={ips} placeholder="e.g. 203.99.180.0/24" onChange={(e) => setIps(e.target.value)} /></Field>
          </div>
        </>
      )}
      {secret && <SecretOnce secret={secret} what="New key" />}
    </Modal>
  );
}

function HookModal({ tenantId, tenantName, onClose, onDone }: { tenantId: string; tenantName: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["invoice.created", "invoice.paid"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (secret) { onClose(); return; }
    if (!WEBHOOK_URL.test(url.trim())) { setErr("Endpoint must be a valid https:// URL"); return; }
    setBusy(true);
    try {
      const r = await createWebhook({ tenantId, url: url.trim(), events: events as (typeof WEBHOOK_EVENTS)[number][] });
      setSecret(r.secret);
      onDone();
      toast("Endpoint added · send a test event to check it", { tone: "good" });
    } catch (e) {
      setErr(adminFieldErrors(e).url ?? adminErrorMessage(e, "Could not add the endpoint"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} wide title="Add webhook endpoint" subtitle={tenantName}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>{secret ? "Close" : "Cancel"}</button>
        <button type="button" className={cn("btn", secret ? "secondary" : "primary")} disabled={busy || (!secret && !events.length)} onClick={go}>{secret ? <><Check />Done</> : <><Plus />Add endpoint</>}</button></>}>
      {!secret ? (
        <>
          <label className="field"><span>Endpoint URL *</span><input value={url} className={err ? "ap-invalid" : undefined} placeholder="https://example.com/webhooks/accountex" autoFocus
            onChange={(e) => { setUrl(e.target.value); setErr(""); }} />{err && <small className="hint text-danger" role="alert">{err}</small>}</label>
          <div className="ap-lbl ap-mt">Events</div>
          <div className="ap-evs">{WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="ap-ev"><input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} /><span>{ev}</span></label>
          ))}</div>
        </>
      ) : <><p className="muted">Use this secret to verify the <code>x-accountex-signature</code> header (HMAC-SHA256 of <code>t.body</code>).</p><SecretOnce secret={secret} what="Signing secret" /></>}
    </Modal>
  );
}
