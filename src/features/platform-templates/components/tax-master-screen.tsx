"use client";

import {
  Building, CalendarCheck, Check, Eye, EyeOff, FileMinus, FlaskConical, History, Landmark, Layers, Pencil, Plug, PlugZap, Plus, Radio, Receipt, Save, UploadCloud, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TAX_TIMEOUTS, type AdminHistoryItem, type AdminHistoryPage, type ConnectionTestResult, type SalesTaxRate, type TaxAuthority, type TaxMaster, type WithholdingRate } from "@/shared";
import { Field } from "@/components/ui/form";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { ErrorState, Skeleton, EmptyState } from "@/components/ui/states";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { useAdminLookups } from "@/features/admin-common/use-admin-lookups";
import { lookupOptions } from "@/features/settings/use-lookups";
import { ApiError } from "@/lib/api/errors";
import { getTaxMaster, publishTaxMaster, taxMasterLog, testAuthority, updateAuthority } from "../api";
import { ScheduledRateModal, ScheduleRateModal, SlabsModal } from "./tax-master-modals";
import { fmtDate, fmtWhen, LogTimeline, pct, rs, verbOf } from "./templates-ui";

type Tab = "st" | "wht" | "fbr" | "log";
const TILE: Record<string, [string, string]> = { FBR: ["Federal GST", "green"], PRA: ["PRA · Punjab", "blue"], SRB: ["SRB · Sindh", "violet"], KPRA: ["KPRA · KP", "orange"], BRA: ["BRA · Balochistan", "lime"] };
const STATUS_TONE: Record<string, string> = { ACTIVE: "good", SCHEDULED: "warn", SUPERSEDED: "neutral" };

/** Per lineage: the rate in force (else the first scheduled one) and the next pending change. */
function lines<T extends SalesTaxRate | WithholdingRate>(rows: T[], key: (r: T) => string) {
  const map = new Map<string, T[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return [...map.values()].map((list) => {
    const current = list.find((r) => r.status === "ACTIVE") ?? list.find((r) => r.status === "SCHEDULED") ?? list[list.length - 1]!;
    const pending = list.find((r) => r.status === "SCHEDULED" && r !== current) ?? null;
    return { current, pending, all: list };
  });
}
const describe = (h: AdminHistoryItem) => {
  const r = h.row ?? {};
  const what = h.table === "TaxMasterSalesTaxRates" ? `sales tax ${pct(Number(r.rate))} from ${String(r.effectiveFrom ?? "")}`
    : h.table === "TaxMasterWithholdingRates" ? `WHT ${String(r.sectionCode ?? "")} from ${String(r.effectiveFrom ?? "")}`
      : h.table === "TaxMasterSalarySlabs" ? `salary slab ${String(r.slabNo ?? "")} (tax year ${String(r.taxYear ?? "")})`
        : `${String(r.code ?? "")} connection`;
  if (h.action === "UPDATE" && h.changes && "publishedAt" in h.changes) return `Published ${what} (${String(r.masterVersion ?? "")})`;
  if (h.action === "UPDATE" && h.changes && "lastTestAt" in h.changes) return `Connection test ${r.lastTestOk ? "passed" : "failed"} · ${String(r.code ?? "")} · ${String(r.lastTestMs ?? "")} ms`;
  if (h.action === "UPDATE" && h.changes && "effectiveTo" in h.changes && Object.keys(h.changes).length <= 2) return `Superseded ${what}: ends ${String(r.effectiveTo ?? "open")}`;
  return `${verbOf(h.action)} ${what}`;
};

/**
 * Template admin/tax-master (3A-admin-plus.html + 9B-admin-plus.js): rate tiles, Sales tax / Withholding (section 149
 * slabs) / FBR-PRAL connection / Change log tabs, "Change rate" modal and "Publish to tenants".
 */
export function TaxMasterScreen() {
  const toast = useToast();
  const [data, setData] = useState<TaxMaster | null>(null);
  const [log, setLog] = useState<AdminHistoryPage | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("st");
  const [attempt, setAttempt] = useState(0);
  const [modal, setModal] = useState<
    | { kind: "schedule"; rate: "sales-tax" | "withholding"; base: SalesTaxRate | WithholdingRate | null }
    | { kind: "scheduled"; rate: "sales-tax" | "withholding"; row: SalesTaxRate | WithholdingRate }
    | { kind: "slabs"; year: number }
    | { kind: "slabsView" }
    | { kind: "publish" }
    | null
  >(null);
  const [publishing, setPublishing] = useState(false);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getTaxMaster(), taxMasterLog()])
      .then(([d, l]) => { if (!cancelled) { setData(d); setLog(l); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the tax master" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const st = useMemo(() => (data ? lines(data.salesTax, (r) => `${r.taxAuthorityId}|${r.appliesTo}`) : []), [data]);
  const wht = useMemo(() => (data ? lines(data.withholding, (r) => r.sectionCode) : []), [data]);
  const year = data?.slabYears[0]?.taxYear ?? new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
  const saved = () => { setModal(null); reload(); };

  const publish = async () => {
    setPublishing(true);
    try {
      const r = await publishTaxMaster();
      toast(`Tax master ${r.masterVersion} published · ${r.published} rate${r.published === 1 ? "" : "s"} available to tenants`, { tone: "good" });
      setModal(null);
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not publish"), { tone: "danger" });
    } finally {
      setPublishing(false);
    }
  };

  const head = (
    <div className="page-head">
      <div><div className="eyebrow">System / Tax Master</div><h1>Tax Master</h1><p>Federal and provincial sales tax, withholding sections and the FBR / PRAL connection used by every tenant.</p></div>
      <div className="head-actions">
        <span className="pill"><CalendarCheck />Tax year <b>{year}</b></span>
        <button type="button" className="btn primary" disabled={!data?.unpublished} onClick={() => setModal({ kind: "publish" })}><UploadCloud />Publish to tenants{data?.unpublished ? ` (${data.unpublished})` : ""}</button>
      </div>
    </div>
  );
  if (error) return <>{head}<ErrorState {...error} onRetry={reload} /></>;
  if (!data || !log) return <>{head}<Skeleton style={{ height: 120, borderRadius: 18 }} /><div className="mt" /><Skeleton style={{ height: 380, borderRadius: 18 }} /></>;

  return (
    <>
      {head}
      <div className="ap-taxtiles">
        {data.authorities.map((a, i) => {
          const line = st.find((l) => l.current.taxAuthorityId === a.id && !/further/i.test(l.current.appliesTo)) ?? st.find((l) => l.current.taxAuthorityId === a.id);
          const [label, color] = TILE[a.code] ?? [a.code, "blue"];
          return (
            <div key={a.id} className="ap-taxtile" style={{ ["--i" as string]: i }}>
              <span className={`icon-tile ${color}`}>{a.code === "FBR" ? <Landmark /> : <Building />}</span>
              <small>{label}</small>
              <b>{line ? pct(line.current.rate) : "—"}</b>
              <span>{a.levyScope === "SERVICES" ? "Services" : "FBR"} · {line ? `eff. ${fmtDate(line.current.effectiveFrom)}` : "no rate yet"}</span>
            </div>
          );
        })}
      </div>

      <div className="tabs" role="tablist">
        {([["st", "Sales tax", Receipt], ["wht", "Withholding", FileMinus], ["fbr", "FBR / PRAL connection", Plug], ["log", "Change log", History]] as const).map(([k, l, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "active" : undefined} onClick={() => setTab(k)}>
            <Icon />{l}{k === "log" && <span className="badge neutral">{log.total}</span>}
          </button>
        ))}
      </div>
      <div className="mt" />

      {tab === "st" && (
        <div className="panel flush">
          <div className="panel-head"><div><h3>Sales tax rates</h3><p>Federal on goods, provincial on services. Tenants import published rates into their tax codes.</p></div><div className="panel-actions"><button type="button" className="btn secondary sm" onClick={() => setModal({ kind: "schedule", rate: "sales-tax", base: null })}><Plus />New rate</button></div></div>
          {st.length === 0 ? <EmptyState title="No sales tax rates yet" description="Add the federal and provincial rates, then publish them to tenants." /> : (
            <div className="table-wrap"><table className="tbl ap-sttbl" data-plain>
              <thead><tr><th>Authority</th><th>Applies to</th><th className="num">Rate</th><th>Reduced / special</th><th>Effective from</th><th>Status</th><th /></tr></thead>
              <tbody>{st.map(({ current: r, pending }) => (
                <tr key={r.id}>
                  <td><div className="cell-user"><span className={cn("icon-well", r.authorityCode !== "FBR" && "teal")}>{r.authorityCode === "FBR" ? <Landmark /> : <Building />}</span><div><b>{r.authorityCode}</b><small>{data.authorities.find((a) => a.id === r.taxAuthorityId)?.name ?? r.jurisdiction}</small></div></div></td>
                  <td>{r.appliesTo}</td>
                  <td className="num"><b className="ap-rate">{pct(r.rate)}</b>{pending && <button type="button" className="ap-pend small" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setModal({ kind: "scheduled", rate: "sales-tax", row: pending })}>→ {pct(pending.rate)} from {fmtDate(pending.effectiveFrom)}</button>}</td>
                  <td>{r.reducedRatesNote ?? "—"}</td>
                  <td>{fmtDate(r.effectiveFrom)}</td>
                  <td><span className={`badge ${STATUS_TONE[r.status] ?? "neutral"}`}>{r.status === "ACTIVE" ? "Active" : r.status === "SCHEDULED" ? "Scheduled" : "Superseded"}</span>{!r.publishedAt && <span className="badge warn" style={{ marginLeft: 4 }}>Unpublished</span>}</td>
                  <td className="actions">
                    {!r.publishedAt && <button type="button" className="btn ghost sm" onClick={() => setModal({ kind: "scheduled", rate: "sales-tax", row: r })}>Details</button>}
                    <button type="button" className="btn ghost sm" disabled={!!pending} title={pending ? "A change is already scheduled" : "Change rate"} onClick={() => setModal({ kind: "schedule", rate: "sales-tax", base: r })}><Pencil />Edit</button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === "wht" && (
        <div className="panel flush">
          <div className="panel-head"><div><h3>Withholding tax sections</h3><p>Income Tax Ordinance 2001 · ATL = Active Taxpayers List</p></div><div className="panel-actions"><button type="button" className="btn secondary sm" onClick={() => setModal({ kind: "slabsView" })}><Layers />Salary slabs</button><button type="button" className="btn secondary sm" onClick={() => setModal({ kind: "schedule", rate: "withholding", base: null })}><Plus />New section</button></div></div>
          {wht.length === 0 ? <EmptyState title="No withholding sections yet" description="Add sections such as 153(1)(a), then publish them to tenants." /> : (
            <div className="table-wrap"><table className="tbl ap-whttbl" data-plain>
              <thead><tr><th>Section</th><th>Nature</th><th>ATL rate</th><th>Non-ATL rate</th><th>Threshold</th><th>Effective</th><th /></tr></thead>
              <tbody>{wht.map(({ current: r, pending }) => (
                <tr key={r.id}>
                  <td><code className="code">{r.sectionCode}</code></td>
                  <td><b>{r.nature}</b>{!r.publishedAt && <span className="badge warn" style={{ marginLeft: 6 }}>Unpublished</span>}</td>
                  <td>{r.usesSalarySlabs ? "Slabs" : `${pct(r.atlRateCompany)} co. · ${pct(r.atlRateOther)} others`}{r.rateNote && <small className="muted" style={{ display: "block" }}>{r.rateNote}</small>}</td>
                  <td className="ap-danger-t">{r.usesSalarySlabs ? "Same slabs" : `${pct(r.nonAtlRateCompany)} · ${pct(r.nonAtlRateOther)}`}</td>
                  <td>{r.thresholdAmount !== null ? `${rs(r.thresholdAmount)}${r.thresholdNote ? ` ${r.thresholdNote}` : ""}` : r.thresholdNote ?? "—"}</td>
                  <td>{fmtDate(r.effectiveFrom)}{pending && <button type="button" className="ap-pend small" style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => setModal({ kind: "scheduled", rate: "withholding", row: pending })}>change from {fmtDate(pending.effectiveFrom)}</button>}</td>
                  <td className="actions">
                    {r.usesSalarySlabs ? <button type="button" className="btn secondary sm" onClick={() => setModal({ kind: "slabsView" })}><Layers />Slabs</button> : null}
                    {!r.publishedAt && <button type="button" className="btn ghost sm" onClick={() => setModal({ kind: "scheduled", rate: "withholding", row: r })}>Details</button>}
                    <button type="button" className="btn ghost sm" disabled={!!pending} title={pending ? "A change is already scheduled" : "Change rate"} onClick={() => setModal({ kind: "schedule", rate: "withholding", base: r })}><Pencil />Edit</button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === "fbr" && <Connection authorities={data.authorities} onSaved={reload} />}

      {tab === "log" && (
        <div className="panel">
          <div className="panel-head"><div><h3>Change log</h3><p>Every rate edit, publish and credential change (platform history)</p></div></div>
          <LogTimeline items={log.items} total={log.total} describe={describe} empty="Rate changes, publishes and connection changes will appear here." />
        </div>
      )}

      {modal?.kind === "schedule" && <ScheduleRateModal kind={modal.rate} base={modal.base} authorities={data.authorities} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.kind === "scheduled" && <ScheduledRateModal kind={modal.rate} row={modal.row} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.kind === "slabs" && <SlabsModal year={modal.year} existing={data.slabYears.find((y) => y.taxYear === modal.year) ?? null} onClose={() => setModal(null)} onSaved={saved} />}
      {modal?.kind === "slabsView" && (
        <Drawer open wide onClose={() => setModal(null)} title="Section 149 · salary slabs" subtitle="Resident individuals · used by every tenant's payroll once imported">
          {data.slabYears.length === 0 ? <EmptyState title="No slabs yet" description="Add the slabs of a tax year." /> : data.slabYears.map((y) => (
            <div key={y.taxYear} className="mb">
              <div className="row mb"><b>Tax year {y.taxYear}</b><small className="muted">FY {y.taxYear - 1}-{String(y.taxYear % 100).padStart(2, "0")}{y.importedByTenants ? ` · imported by tenants (${y.importedByTenants} rows)` : ""}</small><span className="spacer" /><button type="button" className="btn ghost sm" onClick={() => setModal({ kind: "slabs", year: y.taxYear })}><Pencil />{y.importedByTenants ? "View" : "Edit"}</button></div>
              <div className="table-wrap"><table className="tbl" data-plain><thead><tr><th>Taxable income (Rs / year)</th><th>Tax</th></tr></thead><tbody>
                {y.slabs.map((x) => (
                  <tr key={x.id}><td className="tnum"><b>{x.incomeTo === null ? `Above ${x.incomeFrom.toLocaleString("en-PK")}` : x.incomeFrom === 0 ? `Up to ${x.incomeTo.toLocaleString("en-PK")}` : `${(x.incomeFrom + 1).toLocaleString("en-PK")} – ${x.incomeTo.toLocaleString("en-PK")}`}</b></td>
                    <td>{x.ratePct === 0 && x.fixedTax === 0 ? "0%" : `${x.fixedTax ? `${rs(x.fixedTax)} + ` : ""}${pct(x.ratePct)} of amount over ${x.excessOver.toLocaleString("en-PK")}`}</td></tr>
                ))}
              </tbody></table></div>
            </div>
          ))}
          <button type="button" className="btn secondary" onClick={() => setModal({ kind: "slabs", year: (data.slabYears[0]?.taxYear ?? year - 1) + 1 })}><Plus />Add tax year</button>
        </Drawer>
      )}
      <ConfirmDialog open={modal?.kind === "publish"} onClose={() => setModal(null)} onConfirm={publish} busy={publishing} confirmLabel="Publish" title="Publish the tax master?">
        {data.unpublished} unpublished rate{data.unpublished === 1 ? "" : "s"} become available to tenants (Import from Tax Master). Scheduled changes apply on their effective dates. Published rates can&apos;t be edited afterwards.
      </ConfirmDialog>
    </>
  );
}

/** FBR / PRAL connection tab: per authority endpoints, environment, write-only token, POS ID, timeout, test. */
function Connection({ authorities, onSaved }: { authorities: TaxAuthority[]; onSaved: () => void }) {
  const toast = useToast();
  const lookups = useAdminLookups(["ActiveEnvironment", "OnFailure"]);
  const [sel, setSel] = useState(authorities[0]?.id ?? "");
  const a = authorities.find((x) => x.id === sel) ?? authorities[0];
  if (!a) return <EmptyState title="No tax authorities" description="Run the platform SQL to add FBR, PRA, SRB, KPRA and BRA." />;
  return (
    <>
      <div className="seg mb">{authorities.map((x) => <button key={x.id} type="button" className={x.id === a.id ? "active" : undefined} onClick={() => setSel(x.id)}>{x.code}</button>)}</div>
      <ConnectionForm key={`${a.id}:${a.rowVersion}`} a={a} lookups={lookups} toast={toast} onSaved={onSaved} />
    </>
  );
}

function ConnectionForm({ a, lookups, toast, onSaved }: { a: TaxAuthority; lookups: ReturnType<typeof useAdminLookups>; toast: ReturnType<typeof useToast>; onSaved: () => void }) {
  const [f, setF] = useState({ sandboxEndpoint: a.sandboxEndpoint ?? "", productionEndpoint: a.productionEndpoint ?? "", activeEnvironment: a.activeEnvironment, platformPosId: a.platformPosId ?? "", timeoutSeconds: String(a.timeoutSeconds), onFailure: a.onFailure, apiToken: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [goLive, setGoLive] = useState(false);
  const [test, setTest] = useState<ConnectionTestResult | "running" | null>(null);
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const sandbox = f.activeEnvironment === "SANDBOX";

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setErrs({});
    try {
      await updateAuthority(a.id, { ...f, apiToken: f.apiToken || undefined, rowVersion: a.rowVersion, ...extra });
      toast(`${a.code} connection saved`, { tone: "good" });
      onSaved();
    } catch (e) {
      setErrs(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the connection"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    setTest("running");
    try {
      const r = await testAuthority(a.id);
      setTest(r);
      toast(r.ok ? `${a.code} sandbox reachable · ${r.ms} ms` : `${a.code} test failed: ${r.message}`, { tone: r.ok ? "good" : "danger" });
      onSaved();
    } catch (e) {
      setTest(null);
      toast(adminErrorMessage(e, "Could not run the test"), { tone: "danger" });
    }
  };

  return (
    <div className="split ap-fbr-split">
      <div className="panel">
        <div className="panel-head">
          <div><h3>Endpoint configuration · {a.code}</h3><p>{a.name} · digital invoicing for every tenant that enables it</p></div>
          <div className="panel-actions"><div className="seg">
            <button type="button" className={sandbox ? "active" : undefined} onClick={() => set("activeEnvironment", "SANDBOX")}><FlaskConical />Sandbox</button>
            <button type="button" className={!sandbox ? "active" : undefined} onClick={() => { if (sandbox) setGoLive(true); }}><Radio />Production</button>
          </div></div>
        </div>
        <div className={cn("banner ap-envban", sandbox ? "info" : "warn")}>{sandbox ? <FlaskConical /> : <Radio />}<div><b>{sandbox ? "Sandbox mode" : "Production · live reporting"}</b><p>{sandbox ? `Invoices go to ${a.code}'s test gateway. Nothing is reported for real.` : `Every invoice from opted-in tenants is reported to ${a.code} in real time.`}</p></div></div>
        <div className="form-grid">
          <Field label="Sandbox endpoint" full error={errs.sandboxEndpoint}><input value={f.sandboxEndpoint} placeholder="https://…" onChange={(e) => set("sandboxEndpoint", e.target.value)} /></Field>
          <Field label="Production endpoint" full error={errs.productionEndpoint}><input value={f.productionEndpoint} placeholder="https://…" onChange={(e) => set("productionEndpoint", e.target.value)} /></Field>
          <div className="field">
            <span>Security token</span>
            <div className="ap-ig">
              <input type={reveal ? "text" : "password"} value={f.apiToken} autoComplete="off" placeholder={a.hasToken ? `•••••••••••••••• ${a.tokenLast4 ?? ""} (saved; type to replace)` : "Paste the API token"} onChange={(e) => set("apiToken", e.target.value)} />
              <span><button type="button" className="ap-igbtn" aria-label={reveal ? "Hide" : "Show"} onClick={() => setReveal((r) => !r)}>{reveal ? <EyeOff /> : <Eye />}</button></span>
            </div>
            {errs.apiToken && <small className="hint text-danger">{errs.apiToken}</small>}
            {a.hasToken && <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={() => save({ clearToken: true, apiToken: undefined })}><X />Remove saved token</button>}
          </div>
          <Field label="POS ID (platform)" error={errs.platformPosId}><input value={f.platformPosId} maxLength={40} onChange={(e) => set("platformPosId", e.target.value)} /></Field>
          <Field label="Timeout" error={errs.timeoutSeconds}><select value={f.timeoutSeconds} onChange={(e) => set("timeoutSeconds", e.target.value)}>{TAX_TIMEOUTS.map((t) => <option key={t} value={t}>{t} seconds</option>)}</select></Field>
          <Field label="On failure" error={errs.onFailure}><select value={f.onFailure} onChange={(e) => set("onFailure", e.target.value)}>{lookupOptions(lookups, "OnFailure", f.onFailure).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
        </div>
        <div className="form-actions ap-mt">
          <button type="button" className="btn secondary" disabled={busy} onClick={() => save()}><Save />{busy ? "Saving…" : "Save"}</button>
          <button type="button" className="btn primary" disabled={test === "running" || !a.sandboxEndpoint} title={a.sandboxEndpoint ? undefined : "Save a sandbox endpoint first"} onClick={run}><PlugZap />Test connection</button>
        </div>
      </div>
      <div className="stack">
        <div className="panel ap-ctest">
          <div className="panel-head"><div><h3>Connection test</h3><p>Calls the sandbox endpoint with the saved token ({a.timeoutSeconds} s timeout)</p></div></div>
          <div className="ap-conn">
            {test === "running" ? (
              <div className="ap-conn-idle"><span className="ap-conn-orb run"><PlugZap /><em /></span><p>Calling {a.sandboxEndpoint}…</p></div>
            ) : test ? (
              <>
                <div className="ap-conn-idle"><span className={cn("ap-conn-orb", test.ok && "ok")}>{test.ok ? <Check /> : <X />}</span><p>{test.message}</p></div>
                <div className="ap-conn-res" style={test.ok ? undefined : { background: "var(--danger-soft)" }}><div><small>Endpoint</small><code className="code">{test.endpoint}</code></div><div><small>Round trip</small><b>{test.ms.toLocaleString()} ms</b></div></div>
              </>
            ) : (
              <div className="ap-conn-idle"><span className="ap-conn-orb"><Plug /></span><p>{a.lastTestAt ? `Last test ${fmtWhen(a.lastTestAt)}: ${a.lastTestOk ? "passed" : "failed"} · ${a.lastTestMs ?? 0} ms` : "Not tested yet."}</p></div>
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Status</h3><p>{a.jurisdiction} · {a.levyScope.replace(/_/g, " ").toLowerCase()}</p></div></div>
          <div className="dl">
            <div><span>Environment</span><b>{a.activeEnvironment === "SANDBOX" ? "Sandbox" : "Production"}</b></div>
            <div><span>Token</span><b>{a.hasToken ? `Saved · ends ${a.tokenLast4}` : "Not set"}</b></div>
            <div><span>Last test</span><b className={a.lastTestOk === false ? "ap-danger-t" : a.lastTestOk ? "ap-good-t" : undefined}>{a.lastTestAt ? `${a.lastTestOk ? "OK" : "Failed"} · ${fmtWhen(a.lastTestAt)}` : "—"}</b></div>
          </div>
          <p className="small muted ap-mt">Invoice submission counts arrive with FBR submissions (Phase 28).</p>
        </div>
      </div>
      <ConfirmDialog open={goLive} onClose={() => setGoLive(false)} danger confirmLabel="Go live" title="Switch to production?" onConfirm={() => { setGoLive(false); set("activeEnvironment", "PRODUCTION"); }}>
        Invoices from opted-in tenants will be reported to {a.code} for real once you save. Make sure the sandbox test passed today.
      </ConfirmDialog>
    </div>
  );
}
