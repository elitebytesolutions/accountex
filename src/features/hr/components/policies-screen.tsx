"use client";

import { Archive, CopyPlus, FileText, Flag, Paperclip, Plus, Search, Send, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CompanyPolicy } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { ConfirmDialog } from "@/components/ui/overlay";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { PolicyAcknowledgementsDrawer } from "@/features/ess-requests/policy-acks/components/policy-acknowledgements";
import { dateLabel } from "@/features/finance/components/finance-ui";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { createPolicy, deletePolicy, listPolicies, policyAction, updatePolicy } from "../talent-api";
import { TableFoot } from "./people-ui";
import { RecordModal } from "./record-modal";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = Record<string, string | boolean>;
type Action = "publish" | "retire" | "new-version";
const LOOKUPS = ["CompanyPolicyCategory", "CompanyPolicyStatus"];
const PAGE = 20;
const CHIPS = [["", "All"], ["DRAFT", "Draft"], ["PUBLISHED", "Published"], ["RETIRED", "Retired"]] as const;
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): Form => ({ code: "", title: "", version: "1", category: "HR", effectiveDate: today(), readMinutes: "", requiresAcknowledgement: true, body: "" });
const fromPolicy = (p: CompanyPolicy): Form => ({
  code: p.code, title: p.title, version: p.version, category: p.category, effectiveDate: p.effectiveDate, readMinutes: p.readMinutes?.toString() ?? "",
  requiresAcknowledgement: p.requiresAcknowledgement, body: p.body ?? "",
});
/** The employee reader's sub-line (9C-ess.js policySheet): code · version · effective date · owner. */
const subLine = (p: CompanyPolicy) => `${p.code} · v${p.version} · effective ${dateLabel(p.effectiveDate)} · owner ${p.owner?.name ?? "not set"}`;

/**
 * Company policies (new route, template style: there is no admin template, only the employee reader in 9C-ess.js).
 * List with search and status, the editor with History, and Publish / New version / Retire. A published version never
 * changes; employees acknowledge them from My Profile (Phase 34).
 */
export function PoliciesScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [data, setData] = useState<{ items: CompanyPolicy[]; total: number } | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<CompanyPolicy | "new" | null>(null);
  const [f, setF] = useState<Form>(blank());
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [acks, setAcks] = useState<CompanyPolicy | null>(null);

  useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    let cancelled = false;
    listPolicies({ search, status, page, pageSize: PAGE })
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load policies" }));
    return () => { cancelled = true; };
  }, [search, status, page, attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={reload} />;

  const row = edit && edit !== "new" ? edit : null;
  const draft = !row || row.status === "DRAFT";
  const editable = draft && (row ? can.edit : can.create);
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const open = (p: CompanyPolicy | "new") => { setErrs({}); setF(p === "new" ? blank() : fromPolicy(p)); setEdit(p); };
  const run = async (work: () => Promise<CompanyPolicy | void>, done: string, keepOpen = false) => {
    setBusy(true);
    setErrs({});
    try {
      const saved = await work();
      toast(done, { tone: "good" });
      if (keepOpen && saved) open(saved); else setEdit(null);
      reload();
    } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the policy"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const save = () => run(() => (row ? updatePolicy(row.id, { ...f, rowVersion: row.rowVersion }) : createPolicy(f)), row ? `${s("code")} v${s("version")} saved` : "Policy draft created");
  const act = (a: Action) => {
    setConfirm(null);
    if (!row) return;
    return run(() => policyAction(row.id, a, row.rowVersion),
      a === "publish" ? `${row.code} v${row.version} published` : a === "retire" ? `${row.code} v${row.version} retired` : `New draft version of ${row.code} created`, a === "new-version");
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const filtered = !!(search || status);

  return (
    <>
      <PageHead eyebrow="Workforce / Talent / Policies" title="Company Policies" description="Versioned HR, finance, IT and compliance policies employees read and acknowledge."
        actions={can.create ? <button className="btn primary" type="button" onClick={() => open("new")}><Plus />New policy</button> : undefined} />

      <div className="panel flush">
        <div className="panel-head"><div><h3>Policies</h3><p>{data ? `${data.total} version${data.total === 1 ? "" : "s"} · one published version per policy` : "Loading…"}</p></div></div>
        {/* The template's flush-card toolbar inset (polish layer) is scoped to template routes; this route has none. */}
        <div className="toolbar" style={{ padding: "14px 16px 0", marginBottom: 14 }}>
          <label className="search-field" style={{ minWidth: "min(100%, 240px)" }}><Search /><input placeholder="Search code or title…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <span className="spacer" />
          <div className="chips">{CHIPS.map(([v, l]) => <button key={l} type="button" className={cn(status === v && "active")} onClick={() => { setStatus(v); setPage(1); }}>{l}</button>)}</div>
        </div>
        {!data ? <Skeleton style={{ height: 240 }} /> : !data.items.length ? (
          <EmptyState icon={<FileText />} title={filtered ? "No policy matches" : "No policies yet"}
            description={filtered ? "Try another search or status." : can.create ? "Write a policy as a draft, then publish it for employees to read and acknowledge." : "Policies HR publishes appear here."}
            action={!filtered && can.create ? <button className="btn primary sm" type="button" onClick={() => open("new")}><Plus />New policy</button> : undefined} />
        ) : (
          <>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Code</th><th>Title</th><th>Version</th><th>Category</th><th>Effective</th><th>Acknowledgement</th><th>Status</th></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => open(p)}>
                    <td><b>{p.code}</b></td>
                    <td>{p.title}{p.supersedes && <small className="muted" style={{ display: "block" }}>Supersedes v{p.supersedes.version}</small>}</td>
                    <td>v{p.version}</td>
                    <td>{labelOf(lookups, "CompanyPolicyCategory", p.category)}</td>
                    <td>{dateLabel(p.effectiveDate)}</td>
                    <td>{p.requiresAcknowledgement ? "Required" : "Not required"}</td>
                    <td><span className={cn("badge dot", toneOf(lookups, "CompanyPolicyStatus", p.status))}>{labelOf(lookups, "CompanyPolicyStatus", p.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <TableFoot label={`Showing ${(page - 1) * PAGE + 1}–${(page - 1) * PAGE + data.items.length} of ${data.total}`} page={page} pages={pages} go={setPage} />
          </>
        )}
      </div>

      <ConfirmDialog open={confirm !== null} onClose={() => setConfirm(null)} busy={busy} onConfirm={() => confirm && act(confirm)}
        title={confirm === "publish" ? `Publish ${row?.code} v${row?.version}?` : confirm === "retire" ? `Retire ${row?.code} v${row?.version}?` : `New version of ${row?.code}?`}
        confirmLabel={confirm === "publish" ? "Publish" : confirm === "retire" ? "Retire" : "Create draft"} danger={confirm === "retire"}>
        {confirm === "publish" ? "Employees see this version from its effective date. It can't be edited once published, and the version published now (if any) is retired."
          : confirm === "retire" ? "Employees no longer see this version. It stays in the history."
          : "A draft copy with the next version number is created for you to edit and publish."}
      </ConfirmDialog>

      {edit && (
        <RecordModal open wide onClose={() => setEdit(null)} busy={busy} title={row ? row.title : "New policy"}
          subtitle={row ? subLine(row) : "Saved as a draft; publish it when it is ready for employees."}
          history={row ? { schema: "EmployeeSelfService", table: "CompanyPolicies", id: row.id } : null}
          canSave={editable} canDelete={can.remove && row?.status === "DRAFT"} saveLabel={row ? "Save draft" : "Create draft"} onSave={save}
          onDelete={async () => { if (row) await run(() => deletePolicy(row.id, row.rowVersion), `${row.code} v${row.version} deleted`); }}
          deleteNote="Only a draft nothing refers to can be deleted; a published version is retired instead.">
          {row && !draft && (
            <div className={cn("banner mb", row.status === "PUBLISHED" ? "info" : "warn")}><Flag /><div>
              <b>{row.status === "PUBLISHED" ? `Published ${row.publishedAt ? dateLabel(row.publishedAt.slice(0, 10)) : ""}` : "Retired"}</b>
              <p>{row.status === "PUBLISHED" ? "A published version can't be changed. Create a new version to revise it." : "This version is no longer shown to employees."}</p>
            </div></div>
          )}
          <FormGrid>
            <Field label="Code" required error={errs.code} hint={row?.supersedes ? "Fixed for a new version" : "e.g. HR-POL-014"}><input value={s("code")} maxLength={20} disabled={!editable || !!row?.supersedes} onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="Version" required error={errs.version} hint={row?.supersedes ? `Supersedes v${row.supersedes.version}` : "Like 1 or 2.1"}><input value={s("version")} maxLength={7} disabled={!editable} onChange={(e) => set("version", e.target.value)} /></Field>
            <Field label="Title" required full error={errs.title}><input value={s("title")} maxLength={160} placeholder="e.g. Leave & attendance approval policy" disabled={!editable} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Category" error={errs.category}><select value={s("category")} disabled={!editable} onChange={(e) => set("category", e.target.value)}>{lookupOptions(lookups, "CompanyPolicyCategory", s("category")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="Effective from" required error={errs.effectiveDate}><input type="date" value={s("effectiveDate")} disabled={!editable} onChange={(e) => set("effectiveDate", e.target.value)} /></Field>
            <Field label="Owner" hint="Selectable after Phase 11 (employees)"><select disabled value=""><option value="">{row?.owner?.name ?? "After Phase 11"}</option></select></Field>
            <Field label="Reading time (minutes)" error={errs.readMinutes}><input type="number" min={1} value={s("readMinutes")} disabled={!editable} onChange={(e) => set("readMinutes", e.target.value)} /></Field>
            <Check full label="Employees must read and acknowledge it" checked={Boolean(f.requiresAcknowledgement)} disabled={!editable} onChange={(e) => set("requiresAcknowledgement", e.target.checked)} />
            <Field label="Policy text" required={draft} full error={errs.body} hint={editable ? "Required to publish. Start a section with a short heading line." : undefined}>
              <textarea rows={10} maxLength={50000} value={s("body")} readOnly={!editable} onChange={(e) => set("body", e.target.value)} />
            </Field>
            <Field label="Attachment (PDF)" full hint="File uploads arrive with document storage"><button type="button" className="btn secondary sm" disabled><Paperclip />Attach file</button></Field>
          </FormGrid>
          {row && (
            <div className="row mt" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="small muted">Status</span><span className={cn("badge dot", toneOf(lookups, "CompanyPolicyStatus", row.status))}>{labelOf(lookups, "CompanyPolicyStatus", row.status)}</span>
              <span className="spacer" />
              {row.status === "DRAFT" && can.edit && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => setConfirm("publish")}><Send />Publish</button>}
              {row.status !== "DRAFT" && can.create && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => setConfirm("new-version")}><CopyPlus />New version</button>}
              {row.status !== "DRAFT" && <button type="button" className="btn ghost sm" onClick={() => setAcks(row)}><ShieldCheck />Acknowledgements</button>}
              {row.status === "PUBLISHED" && can.edit && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => setConfirm("retire")}><Archive />Retire</button>}
            </div>
          )}
        </RecordModal>
      )}

      <PolicyAcknowledgementsDrawer policyId={acks?.id ?? null} title={acks?.title ?? ""} onClose={() => setAcks(null)} />
    </>
  );
}
