"use client";

import { Clock, KeyRound, PlugZap, Plus, ReceiptText, RefreshCw, TriangleAlert, Wifi, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { FbrAuthority, FbrSetting, HistoryItem } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormGrid, Switch } from "@/components/ui/form";
import { PageHead, Panel } from "@/components/ui/page";
import { Banner, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { whenLabel } from "@/features/access/components/access-ui";
import { getHistory } from "@/features/history/api";
import { labelOf, useLookups } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getFbrSettings, listBranchOptions, saveFbrSettings, type BranchOption } from "../api";
import { apiFieldErrors, apiMessage } from "./treasury-ui";

type Form = {
  environment: "SANDBOX" | "PRODUCTION"; posId: string; apiToken: string; clearToken: boolean; tokenExpiresOn: string; reportOnPosting: boolean; printQr: boolean;
  blockIfUnreachable: boolean; syncIntervalMinutes: string; isActive: boolean; mappings: { id?: string; branchId: string; posId: string; isActive: boolean }[];
};
const LOOKUPS = ["FbrSettingAuthority", "FbrSettingEnvironment", "ConnectionStatus"];
const toForm = (s: FbrSetting): Form => ({
  environment: s.environment as Form["environment"], posId: s.posId, apiToken: "", clearToken: false, tokenExpiresOn: s.tokenExpiresOn ?? "",
  reportOnPosting: s.reportOnPosting, printQr: s.printQr, blockIfUnreachable: s.blockIfUnreachable, syncIntervalMinutes: String(s.syncIntervalMinutes), isActive: s.isActive,
  mappings: s.mappings.map((m) => ({ id: m.id, branchId: m.branchId ?? "", posId: m.posId, isActive: m.isActive })),
});

/** Template app/tax/fbr (42-acc-reports.html): credentials, behaviour, connection history. Testing and syncing arrive with FBR Submissions (Phase 28). */
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([getFbrSettings(), listBranchOptions()])
      .then(([s, b]) => { if (!cancelled) { setSettings(s); setBranches(b); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load FBR settings" }));
    return () => { cancelled = true; };
  }, [attempt]);
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
        syncIntervalMinutes: Number(form.syncIntervalMinutes), isActive: form.isActive,
        mappings: form.mappings.map((m) => ({ ...(m.id && { id: m.id }), branchId: m.branchId || null, posId: m.posId, isActive: m.isActive })),
        ...(current.rowVersion !== null && { rowVersion: current.rowVersion }),
      });
      toast(`${tab} settings saved${saved.hasToken ? ` · token ••••${saved.tokenHint}` : ""}`, { tone: "good" });
      reload();
    } catch (e) {
      setErrs(apiFieldErrors(e));
      toast(apiMessage(e, "Could not save the settings"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;
  const later = "Arrives with FBR Submissions (Phase 28)";

  return (
    <>
      <PageHead
        eyebrow="Tax & Compliance / FBR Integration"
        title="FBR Integration"
        description="Real-time invoice reporting to FBR (POS / Digital Invoicing) and PRA. Set up the credentials here; reporting starts with sales invoicing."
        actions={
          <>
            <Button icon={<PlugZap />} disabled title={later}>Test connection</Button>
            <Button variant="primary" icon={<RefreshCw />} disabled title={later}>Sync now</Button>
          </>
        }
      />
      <Tabs items={[{ key: "FBR", label: labelOf(lookups, "FbrSettingAuthority", "FBR") }, { key: "PRA", label: labelOf(lookups, "FbrSettingAuthority", "PRA") }]} active={tab} onChange={setTab} />

      <div className="kpi-grid mt">
        <div className="kpi"><div className="kpi-top"><span>Connection</span><span className="icon-well"><Wifi /></span></div><strong>{!current ? "…" : current.hasToken && current.connectionStatus === "NOT_CONFIGURED" ? "Not tested" : labelOf(lookups, "ConnectionStatus", current.connectionStatus)}</strong><small>{current?.hasToken ? `${labelOf(lookups, "FbrSettingEnvironment", current.environment)} · token saved, not tested` : "No token saved"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Last sync</span><span className="icon-well"><Clock /></span></div><strong>{current?.lastSyncAt ? whenLabel(current.lastSyncAt) : "—"}</strong><small>{current ? `Auto every ${current.syncIntervalMinutes} min once live` : ""}</small></div>
        <div className="kpi blue"><div className="kpi-top"><span>Invoices reported</span><span className="icon-well"><ReceiptText /></span></div><strong>—</strong><small>From sales invoicing (Phase 23)</small></div>
        <div className="kpi yellow"><div className="kpi-top"><span>Pending / failed</span><span className="icon-well"><TriangleAlert /></span></div><strong>— / —</strong><small>Today&apos;s queue</small></div>
      </div>

      <div className="split mt">
        <Panel flush title="Invoice sync log" description={`Latest submissions to ${tab}`}>
          <EmptyState icon={<ReceiptText />} title="Nothing reported yet" description="Sales invoices are reported here once invoicing (Phase 23) and FBR submissions (Phase 28) are live." />
        </Panel>
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><div><h3>Credentials</h3><p>Issued by {tab === "FBR" ? "FBR / PRAL" : "PRA"}</p></div>{current && <Badge tone={current.isActive && current.hasToken ? "good" : "neutral"} dot>{current.id ? (current.isActive ? "Enabled" : "Disabled") : "Not set up"}</Badge>}</div>
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
            {!current?.id ? <p className="small muted">Not set up yet.</p> : !history ? <Skeleton style={{ height: 60 }} /> : (
              <div className="timeline">
                {history.slice(0, 6).map((h) => (
                  <div key={h.entryId} className="tl-item">
                    <span className="tl-dot" />
                    <div><b>{h.action === "INSERT" ? "Settings created" : h.changes && "apiTokenHint" in h.changes ? "Token changed" : "Settings changed"}</b><small>{whenLabel(h.occurredAt)} by {h.actor.name ?? "system"}</small></div>
                  </div>
                ))}
                {!history.length && <p className="small muted">No changes yet.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
