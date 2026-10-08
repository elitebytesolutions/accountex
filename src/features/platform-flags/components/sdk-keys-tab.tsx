"use client";

import { Ban, Copy, History, KeyRound, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FlagEnvironment, FlagSdkKey, FlagSdkKeyIssued } from "@/shared";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { adminErrorMessage } from "@/features/admin-common/errors";
import { ApiError } from "@/lib/api/errors";
import { createSdkKey, listSdkKeys, revokeSdkKey, rotateSdkKey } from "../api";
import { ENVS, EnvDot, fmtDate } from "./flag-ui";

const KINDS: { kind: string; label: string; hint: string; secret: boolean }[] = [
  { kind: "SERVER", label: "Server-side SDK key", hint: "Secret. Node, .NET and Go services only.", secret: true },
  { kind: "CLIENT", label: "Client-side ID", hint: "Safe in the browser bundle.", secret: false },
  { kind: "MOBILE", label: "Mobile key", hint: "Android, iOS and the booker app.", secret: true },
];
const ENV_NOTE: Record<string, [string, string, string]> = {
  PRODUCTION: ["Live tenants · protected", "danger", "Protected"],
  STAGING: ["Pre-release QA · mirrors prod data shape", "warn", "Shared"],
  DEV: ["Engineers & CI · anything goes", "info", "Open"],
};
/** Masked display: prefix + dots + last 4 (template mask()). Secrets are never sent back after they are issued. */
export const maskKey = (k: FlagSdkKey) => (k.clientId ?? `${k.keyPrefix}${"•".repeat(14)}${k.keyLast4}`);

/**
 * Template "SDK keys" tab: one card per environment with server / client / mobile keys. A new or rotated secret is
 * shown once; rotation keeps the old key in GRACE for 24 h. Quick start panel as in the template.
 */
export function SdkKeysTab() {
  const toast = useToast();
  const [keys, setKeys] = useState<FlagSdkKey[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [issued, setIssued] = useState<FlagSdkKeyIssued | null>(null);
  const [confirm, setConfirm] = useState<{ key: FlagSdkKey; action: "rotate" | "revoke" } | null>(null);
  const [history, setHistory] = useState<FlagSdkKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSdkKeys()
      .then((k) => { if (!cancelled) { setKeys(k); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load SDK keys" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  if (!keys) return <div className="ff-sdkgrid">{ENVS.map((e) => <div key={e.code} className="panel"><Skeleton style={{ height: 140 }} /></div>)}</div>;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast(ok, { tone: "good" }); reload(); }
    catch (e) { toast(adminErrorMessage(e, "Could not update the key"), { tone: "danger" }); }
    finally { setBusy(false); setConfirm(null); }
  };
  const issue = (env: FlagEnvironment, kind: string) => run(async () => setIssued(await createSdkKey(env, kind)), "Key issued");
  const copy = async (text: string, what = "Copied to clipboard") => { try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ } toast(what, { tone: "info", ms: 2200 }); };

  return (
    <>
      <div className="ff-sdkgrid">
        {ENVS.map((e) => {
          const [note, tone, badge] = ENV_NOTE[e.code]!;
          const latest = keys.filter((k) => k.environment === e.code).map((k) => k.updatedAt).sort().at(-1) ?? null;
          return (
            <div key={e.code} className={cn("panel ff-envcard", `e-${e.css}`)}>
              <div className="ff-envcard-h"><EnvDot env={e.code} /><div><h3>{e.label}</h3><p>{note}</p></div><span className={cn("badge", tone)}>{badge}</span></div>
              {KINDS.map((k) => {
                const active = keys.find((x) => x.environment === e.code && x.kind === k.kind && x.status === "ACTIVE");
                const grace = keys.filter((x) => x.environment === e.code && x.kind === k.kind && x.status === "GRACE");
                return (
                  <div key={k.kind} className="ff-sdk">
                    <div className="ff-sdk-l"><b>{k.label}</b><small>{k.hint}</small>
                      {grace.map((g) => <small key={g.id} className="muted">Old key …{g.keyLast4} works until {fmtDate(g.validUntil)}</small>)}
                    </div>
                    <div className="ff-sdk-v">
                      {active ? (
                        <>
                          <code>{maskKey(active)}</code>
                          {!k.secret && <button type="button" className="icon-btn-sm" aria-label="Copy" onClick={() => copy(active.clientId ?? "")}><Copy /></button>}
                          <button type="button" className="icon-btn-sm" aria-label="Rotate" disabled={busy} onClick={() => setConfirm({ key: active, action: "rotate" })}><RefreshCw /></button>
                          <button type="button" className="icon-btn-sm" aria-label="Revoke" disabled={busy} onClick={() => setConfirm({ key: active, action: "revoke" })}><Ban /></button>
                          <button type="button" className="icon-btn-sm" aria-label="History" onClick={() => setHistory(active)}><History /></button>
                        </>
                      ) : (
                        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => issue(e.code, k.kind)}><Plus />Issue key</button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="ff-sdk-foot"><span><KeyRound />Evaluation counts arrive with SDK telemetry</span><span>{latest ? `Changed ${fmtDate(latest)}` : "No keys yet"}</span></div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Quick start</h3><p>Evaluate a flag for a tenant. Bucketing is sticky on <code className="ff-key">tenant.code</code>, so a tenant never flips between variations.</p></div>
          <button type="button" className="btn ghost sm" onClick={() => copy("import { init } from '@accountex/flags-node';")}><Copy />Copy</button></div>
        <pre className="ff-code"><span className="c">{"// server.ts"}</span>{"\n"}<span className="k">import</span> {"{ init }"} <span className="k">from</span> <span className="s">&apos;@accountex/flags-node&apos;</span>;{"\n"}<span className="k">const</span> flags = init(process.env.<span className="v">ACCOUNTEX_SDK_KEY</span>);{"\n\n"}<span className="k">const</span> ctx = {"{ key: tenant.code, plan: tenant.plan, city: tenant.city, appVersion: "}<span className="s">&apos;4.12.1&apos;</span>{" }"};{"\n"}<span className="k">if</span> (<span className="k">await</span> flags.variation(<span className="s">&apos;wholesale_quick_entry_grid&apos;</span>, ctx, <span className="v">false</span>)) {"{"}{"\n"}  renderQuickEntryGrid();{"\n"}{"}"}</pre>
      </div>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="Copy this key now" subtitle="It is shown only once. Only its hash is stored."
        foot={<><button type="button" className="btn secondary" onClick={() => issued && copy(issued.secret, "Key copied to clipboard")}><Copy />Copy key</button><button type="button" className="btn primary" onClick={() => setIssued(null)}>Done</button></>}>
        {issued && <div className="stack"><p className="muted">{issued.key.environment} · {issued.key.kind}</p><pre className="ff-code sm">{issued.secret}</pre></div>}
      </Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} busy={busy} danger={confirm?.key.environment === "PRODUCTION" || confirm?.action === "revoke"}
        title={confirm?.action === "rotate" ? "Rotate this key?" : "Revoke this key?"} confirmLabel={confirm?.action === "rotate" ? "Rotate key" : "Revoke key"}
        onConfirm={() => confirm && (confirm.action === "rotate"
          ? run(async () => setIssued(await rotateSdkKey(confirm.key.id)), "Key rotated · old key expires in 24 h")
          : run(() => revokeSdkKey(confirm.key.id), "Key revoked"))}>
        {confirm?.action === "rotate" ? "A new key is issued now. The old one keeps working for 24 hours so you can redeploy." : "SDKs using this key stop receiving flags immediately."}
      </ConfirmDialog>
      <Modal open={!!history} onClose={() => setHistory(null)} title="Key history" subtitle={history ? maskKey(history) : undefined}>
        {history && <AdminHistoryTab table="FlagSdkKeys" id={history.id} />}
      </Modal>
    </>
  );
}
