"use client";

import {
  Building2, Check, Copy, Fingerprint, History, Info, KeyRound, Landmark, LogIn, Mail, MessageCircle, Pencil, Plug, Plus, RotateCcw, Search, Send, ShoppingBag, Store, Trash2, Webhook,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { TENANT_WEBHOOK_EVENTS, TenantWebhookInputSchema, type IntegrationCard, type IntegrationsOverview, type TenantWebhook, type TenantWebhookDelivery } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Field, Switch } from "@/components/ui/form";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { companyTimeZone } from "@/lib/company-time";
import { createWebhook, deleteWebhook, integrations, redeliver, setProvider, testWebhook, updateWebhook, webhookDeliveries } from "../api";
import "./integrations-screen.css";

export type IntegrationsCan = { create: boolean; edit: boolean; delete: boolean };

/** Providers the company connects itself from this screen (the rest are managed on their own screens). */
const SELF_SERVE = new Set(["GOOGLE_WORKSPACE", "MICROSOFT_365", "WHATSAPP_BUSINESS", "SMTP", "DARAZ", "SHOPIFY"]);
const ICONS: Record<string, { icon: ReactNode; tone?: string }> = {
  FBR_IRIS_POS: { icon: <Landmark /> }, BANK_FEED: { icon: <Building2 /> }, ZKTECO: { icon: <Fingerprint />, tone: "teal" },
  GOOGLE_WORKSPACE: { icon: <LogIn />, tone: "blue" }, MICROSOFT_365: { icon: <Mail />, tone: "blue" }, WHATSAPP_BUSINESS: { icon: <MessageCircle /> },
  SMTP: { icon: <Send />, tone: "violet" }, DARAZ: { icon: <ShoppingBag />, tone: "yellow" }, SHOPIFY: { icon: <Store /> },
};
const STATUS: Record<string, [string, string]> = {
  CONNECTED: ["good dot", "Connected"], NOT_CONNECTED: ["neutral", "Not connected"], REAUTH_NEEDED: ["warn dot", "Re-auth needed"], ERROR: ["danger dot", "Error"],
};
const HEALTH: Record<string, [string, string]> = { HEALTHY: ["good dot", "Healthy"], FAILING: ["danger dot", "Failing"], DISABLED: ["neutral", "Disabled"] };
const CHIPS = [["ALL", "All"], ["CONNECTED", "Connected"], ["TAX", "Tax"], ["BANKING", "Banking"], ["HR", "HR"], ["COMMERCE", "Commerce"]] as const;
type Chip = (typeof CHIPS)[number][0];
const KEY_NOTE = "API keys are issued by Accountex support — contact support to request or revoke a key.";

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: companyTimeZone(), day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: companyTimeZone(), day: "2-digit", month: "short", year: "numeric" }) : "—");
const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** Settings › Integrations (template 60-settings-ess.html app/settings/integrations). API keys are read-only: issued by the Super Admin. */
export function IntegrationsScreen({ can }: { can: IntegrationsCan }) {
  const toast = useToast();
  const [data, setData] = useState<IntegrationsOverview | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    integrations()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load integrations" }); });
    return () => { cancelled = true; };
  }, [attempt]);

  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [keyInfo, setKeyInfo] = useState(false);
  const [hookModal, setHookModal] = useState<{ edit?: TenantWebhook } | null>(null);
  const [removing, setRemoving] = useState<TenantWebhook | null>(null);
  const [log, setLog] = useState<TenantWebhook | null>(null);

  const cards = useMemo(() => data?.cards ?? [], [data]);
  const shown = cards.filter((c) => {
    if (chip === "CONNECTED" ? c.status !== "CONNECTED" : chip !== "ALL" && c.category !== chip) return false;
    const s = q.trim().toLowerCase();
    return !s || `${c.label} ${c.displayName} ${c.referenceLabel ?? ""} ${c.category}`.toLowerCase().includes(s);
  });
  const connected = cards.filter((c) => c.status === "CONNECTED").length;

  const toggle = async (c: IntegrationCard, connect: boolean) => {
    setBusy(c.provider);
    try {
      setData(await setProvider(c.provider, connect));
      toast(`${c.label} ${connect ? "connected" : "disconnected"}`, { tone: connect ? "good" : "info" });
    } catch (e) {
      toast(errMsg(e, `Could not ${connect ? "connect" : "disconnect"} ${c.label}`), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };
  const ping = async (w: TenantWebhook) => {
    setBusy(w.id);
    try {
      await testWebhook(w.id);
      toast("Test event delivered", { tone: "good" });
    } catch (e) {
      toast(errMsg(e, "The test event failed"), { tone: "danger" });
    } finally {
      setBusy(null);
      reload();
    }
  };

  return (
    <>
      <PageHead eyebrow="Settings / Integrations" title="Integrations" description="Connect FBR, banks, biometric devices, SSO and e-commerce channels."
        actions={<button type="button" className="btn secondary" onClick={() => setKeyInfo(true)}><KeyRound />Request a key</button>} />

      <div className="toolbar">
        <label className="search-field"><Search /><input placeholder="Search integrations…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search integrations" /></label>
        <div className="chips">
          {CHIPS.map(([k, l]) => (
            <button key={k} type="button" className={chip === k ? "active" : undefined} onClick={() => setChip(k)}>
              {l}{k === "ALL" && data && <i>{cards.length}</i>}{k === "CONNECTED" && data && <i>{connected}</i>}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}
      {!data && !error && <div className="card-grid mb">{[0, 1, 2, 3].map((i) => <Skeleton key={i} style={{ height: 140 }} />)}</div>}
      {data && (shown.length === 0 ? (
        <div className="panel mb"><EmptyState icon={<Plug />} title="No integrations match" description="Try another search or filter." /></div>
      ) : (
        <div className="card-grid mb">
          {shown.map((c) => {
            const [tone, label] = STATUS[c.status] ?? ["neutral", c.status];
            const ic = ICONS[c.provider] ?? { icon: <Plug /> };
            const self = SELF_SERVE.has(c.provider);
            const on = c.status === "CONNECTED";
            return (
              <div key={c.provider} className="card">
                <div className="row"><span className={cn("icon-well", ic.tone)}>{ic.icon}</span>
                  <div><b>{c.label}</b>{c.displayName !== c.label && <small className="muted"> {c.displayName}</small>}</div>
                  <span className="spacer" /><span className={`badge ${tone}`}>{label}</span></div>
                <p className="small muted mt">
                  {c.referenceLabel ?? (on ? `Connected ${fmtDay(c.connectedAt)}${c.connectedBy ? ` by ${c.connectedBy.name}` : ""}.` : "Not set up yet.")}
                  {c.lastSyncAt && <> Last sync {fmtDateTime(c.lastSyncAt)}.</>}
                  {c.lastError && <span className="text-danger"> {c.lastError}</span>}
                </p>
                <div className="row mt">
                  {c.manageRoute && <Link className="btn secondary sm" href={c.manageRoute}>Configure</Link>}
                  {self && can.edit && (on
                    ? <button type="button" className="btn ghost sm" disabled={busy === c.provider} onClick={() => void toggle(c, false)}>{busy === c.provider ? "Disconnecting…" : "Disconnect"}</button>
                    : <button type="button" className={cn("btn sm", c.status === "NOT_CONNECTED" ? "secondary" : "primary")} disabled={busy === c.provider} onClick={() => void toggle(c, true)}>
                      {busy === c.provider ? "Connecting…" : c.status === "NOT_CONNECTED" ? "Connect" : "Reconnect"}</button>)}
                </div>
                {self && <small className="muted intg-note">Records the connection; live sync arrives with each provider&apos;s integration.</small>}
              </div>
            );
          })}
          {chip === "ALL" && !q.trim() && (
            <div className="card">
              <div className="row"><span className="icon-well"><KeyRound /></span><div><b>REST API &amp; Keys</b></div><span className="spacer" />
                <span className="badge info">{data.apiKeys.length} {data.apiKeys.length === 1 ? "key" : "keys"}</span></div>
              <p className="small muted mt">Build custom integrations with scoped API keys and webhooks.</p>
              <div className="row mt"><button type="button" className="btn secondary sm" onClick={() => setKeyInfo(true)}>Request a key</button></div>
            </div>
          )}
        </div>
      ))}

      <div className="grid-2">
        <div className="panel flush">
          <div className="panel-head"><div><h3>API keys</h3><p>Issued by Accountex support · read-only</p></div></div>
          <div className="intg-pad"><Banner tone="info" title="Keys are issued by Accountex support">{KEY_NOTE}</Banner></div>
          {!data ? (error ? null : <Skeleton style={{ height: 80 }} />) : data.apiKeys.length === 0 ? (
            <EmptyState icon={<KeyRound />} title="No API keys" description="No keys have been issued to your company yet." />
          ) : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Name</th><th>Key</th><th>Scopes</th><th>Created</th><th>Expires</th><th>Last used</th><th>Status</th></tr></thead>
              <tbody>
                {data.apiKeys.map((k) => (
                  <tr key={k.id}>
                    <td><b>{k.name}</b><small>{k.environment.toLowerCase()}</small></td>
                    <td><code>{k.prefix}…{k.last4}</code></td>
                    <td><div className="intg-scopes">{k.scopes.map((s) => <span key={s} className="badge neutral">{s}</span>)}</div></td>
                    <td>{fmtDay(k.createdAt)}</td>
                    <td>{k.expiresAt ? fmtDay(k.expiresAt) : "Never"}</td>
                    <td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}</td>
                    <td><span className={`badge ${k.status === "ACTIVE" ? "good dot" : k.status === "EXPIRED" ? "warn" : "neutral"}`}>{k.status.charAt(0) + k.status.slice(1).toLowerCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div className="panel flush">
          <div className="panel-head"><div><h3>Webhooks</h3><p>Signed with HMAC-SHA256</p></div>
            {can.create && <div className="panel-actions"><button type="button" className="btn secondary sm" onClick={() => setHookModal({})}><Plus />Add endpoint</button></div>}</div>
          <div className="intg-pad"><Banner tone="info" title="Test and redeliver only for now">Endpoints receive test and redelivered events in this release; business events (invoices, payments…) are wired in a later phase.</Banner></div>
          {!data ? (error ? null : <Skeleton style={{ height: 80 }} />) : data.webhooks.length === 0 ? (
            <EmptyState icon={<Webhook />} title="No webhook endpoints" description={can.create ? "Add an https:// endpoint to receive signed events." : "No endpoints have been added."} />
          ) : (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Endpoint</th><th>Events</th><th>Success</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.webhooks.map((w) => {
                  const [tone, label] = HEALTH[w.healthStatus] ?? (w.isActive ? ["neutral", w.healthStatus] : HEALTH.DISABLED!);
                  return (
                    <tr key={w.id}>
                      <td><code>{w.url}</code>{w.lastDeliveryAt && <small>Last delivery {fmtDateTime(w.lastDeliveryAt)}</small>}</td>
                      <td>{w.events.join(", ")}</td>
                      <td>{w.successRatePct === null ? "—" : `${w.successRatePct}%`}</td>
                      <td><span className={`badge ${tone}`}>{label}</span></td>
                      <td className="actions"><div className="row intg-nowrap">
                        {can.edit && <button type="button" className="icon-btn-sm" aria-label="Send test event" title="Send test event" disabled={busy === w.id || !w.isActive} onClick={() => void ping(w)}><Send /></button>}
                        <button type="button" className="icon-btn-sm" aria-label="Deliveries" title="Deliveries" onClick={() => setLog(w)}><History /></button>
                        {can.edit && <button type="button" className="icon-btn-sm" aria-label="Edit endpoint" title="Edit" onClick={() => setHookModal({ edit: w })}><Pencil /></button>}
                        {can.delete && <button type="button" className="icon-btn-sm" aria-label="Delete endpoint" title="Delete" onClick={() => setRemoving(w)}><Trash2 /></button>}
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
      </div>

      <Modal open={keyInfo} onClose={() => setKeyInfo(false)} title="Request an API key" subtitle="Keys are issued per company by Accountex support"
        foot={<button type="button" className="btn primary" onClick={() => setKeyInfo(false)}>Got it</button>}>
        <Banner tone="info" title="Contact Accountex support">{KEY_NOTE} Tell support the key name, environment (live or test) and the scopes you need.</Banner>
      </Modal>
      {hookModal && <HookModal key={hookModal.edit?.id ?? "new"} edit={hookModal.edit} onClose={() => setHookModal(null)} onDone={reload} />}
      {log && <DeliveriesDrawer hook={log} canRedeliver={can.edit} onClose={() => setLog(null)} onChanged={reload} />}
      <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} danger confirmLabel="Delete endpoint" busy={busy === removing?.id} title="Delete this endpoint?"
        onConfirm={async () => {
          const w = removing!;
          setBusy(w.id);
          try {
            await deleteWebhook(w.id);
            toast("Endpoint deleted", { tone: "good" });
            setRemoving(null);
            reload();
          } catch (e) {
            toast(errMsg(e, "Could not delete the endpoint"), { tone: "danger" });
          } finally {
            setBusy(null);
          }
        }}>
        {removing?.url} stops receiving events. Its delivery log stays in history.
      </ConfirmDialog>
    </>
  );
}

function HookModal({ edit, onClose, onDone }: { edit?: TenantWebhook; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState(edit?.url ?? "");
  const [events, setEvents] = useState<string[]>(edit?.events ?? ["invoice.posted"]);
  const [isActive, setIsActive] = useState(edit?.isActive ?? true);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (secret) { onClose(); return; }
    const parsed = TenantWebhookInputSchema.safeParse({ url, events, isActive });
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[String(i.path[0])] ??= i.message;
      setErrs(f);
      return;
    }
    setBusy(true);
    setErrs({});
    try {
      if (edit) {
        await updateWebhook(edit.id, { ...parsed.data, rowVersion: edit.rowVersion });
        toast("Endpoint saved", { tone: "good" });
        onDone();
        onClose();
      } else {
        const r = await createWebhook(parsed.data);
        onDone();
        toast("Endpoint added · send a test event to check it", { tone: "good" });
        if (r.secret) setSecret(r.secret); else onClose();
      }
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrs(Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, v[0] ?? ""])));
      toast(errMsg(e, edit ? "Could not save the endpoint" : "Could not add the endpoint"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={edit ? "Edit webhook endpoint" : "Add webhook endpoint"} subtitle="Events are signed with HMAC-SHA256"
      foot={<>
        <button type="button" className="btn secondary" onClick={onClose}>{secret ? "Close" : "Cancel"}</button>
        <button type="button" className={cn("btn", secret ? "secondary" : "primary")} disabled={busy} onClick={() => void go()}>
          {secret ? <><Check />Done</> : edit ? (busy ? "Saving…" : "Save endpoint") : <><Plus />{busy ? "Adding…" : "Add endpoint"}</>}</button>
      </>}>
      {secret ? (
        <>
          <p className="muted">Use this secret to verify the signature header (HMAC-SHA256) on every event.</p>
          <div className="intg-secret">
            <small>Copy it now — it won&apos;t be shown again.</small>
            <div className="row"><code className="code">{secret}</code>
              <button type="button" className="btn primary sm" onClick={async () => toast((await copyText(secret)) ? "Signing secret copied" : "Could not copy", { tone: "info" })}><Copy />Copy</button></div>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <Field label="Endpoint URL" required full error={errs.url}>
              <input value={url} aria-invalid={!!errs.url} placeholder="https://example.com/webhooks/accountex" autoFocus onChange={(e) => { setUrl(e.target.value); setErrs((x) => ({ ...x, url: "" })); }} />
            </Field>
          </div>
          <div className="form-section mt"><h4>Events</h4></div>
          <div className="grid-2 intg-events">
            {TENANT_WEBHOOK_EVENTS.map((ev) => (
              <label key={ev} className="check"><input type="checkbox" checked={events.includes(ev)}
                onChange={(e) => { setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev)); setErrs((x) => ({ ...x, events: "" })); }} /> {ev}</label>
            ))}
          </div>
          {errs.events && <small className="hint text-danger" role="alert">{errs.events}</small>}
          {edit && <div className="mt"><Switch label="Active (receives events)" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /></div>}
        </>
      )}
    </Modal>
  );
}

function DeliveriesDrawer({ hook, canRedeliver, onClose, onChanged }: { hook: TenantWebhook; canRedeliver: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<TenantWebhookDelivery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    webhookDeliveries(hook.id)
      .then((d) => { if (!cancelled) { setRows(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(errMsg(e, "Could not load deliveries")); });
    return () => { cancelled = true; };
  }, [hook.id, attempt]);

  const again = async (d: TenantWebhookDelivery) => {
    setBusy(d.id);
    try {
      const list = await redeliver(d.id);
      setRows(list);
      const latest = [...list].sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt))[0];
      toast(latest?.isSuccess ? `${d.event} redelivered` : `Redelivery failed${latest?.error ? `: ${latest.error}` : ""}`, { tone: latest?.isSuccess ? "good" : "danger" });
      onChanged();
    } catch (e) {
      toast(errMsg(e, "Could not redeliver the event"), { tone: "danger" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer open onClose={onClose} wide title="Deliveries" subtitle={hook.url}>
      {error ? <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} /> : !rows ? <Skeleton style={{ height: 160 }} /> : rows.length === 0 ? (
        <EmptyState icon={<Send />} title="No deliveries yet" description="Send a test event to see it here." />
      ) : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>Time</th><th>Event</th><th>Attempt</th><th>HTTP</th><th>Result</th><th className="num">Duration</th>{canRedeliver && <th />}</tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{fmtDateTime(d.deliveredAt)}</td>
                <td><code>{d.event}</code></td>
                <td>{d.attempt}</td>
                <td>{d.responseStatus ?? "—"}</td>
                <td><span className={`badge ${d.isSuccess ? "good" : "danger"} dot`}>{d.isSuccess ? "OK" : "Failed"}</span>{d.error && <small className="text-danger">{d.error}</small>}</td>
                <td className="num">{d.durationMs === null ? "—" : `${d.durationMs.toLocaleString()} ms`}</td>
                {canRedeliver && <td className="actions"><button type="button" className="icon-btn-sm" aria-label="Redeliver" title="Redeliver" disabled={busy === d.id} onClick={() => void again(d)}><RotateCcw /></button></td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <p className="small muted mt"><Info className="intg-ico" /> Redelivery re-sends the same event id with the attempt number increased.</p>
    </Drawer>
  );
}
