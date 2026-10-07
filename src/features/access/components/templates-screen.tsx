"use client";

import { FileText, History, Plus, Printer, Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MERGE_FIELDS, TEMPLATE_FLAGS, type CompanySettings, type DocumentTemplate, type DocumentTemplateSave, type DocumentType } from "@/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Drawer } from "@/components/ui/overlay";
import { Panel } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { HistoryTab } from "@/features/history/components/history-tab";
import { getCompanySettings, listDocumentTypes } from "@/features/settings/api";
import { labelOf, lookupOptions, useLookups } from "@/features/settings/use-lookups";
import { initialsOf } from "@/features/auth/initials";
import { ApiError } from "@/lib/api/errors";
import { createTemplate, deleteTemplate, listTemplates, templateAction, updateTemplate } from "../api";

const LOOKUPS = ["DocumentTemplateCategory", "Paper", "HeaderLayout", "DocumentTemplateLanguage", "LetterKind", "DocumentTemplateStatus"];
type Form = DocumentTemplateSave;
const blank = (): Form => ({
  name: "", category: "SALES", docType: "INV", letterKind: null, paper: "A4_PORTRAIT", headerLayout: "LOGO_LEFT", language: "EN",
  showNtnStrn: true, showFbrQr: true, showHsCodes: true, showItemImages: false, showAmountInWords: true, showBankDetails: true, bodyHtml: null,
});
const toForm = (t: DocumentTemplate): Form => ({
  name: t.name, category: t.category, docType: t.docType, letterKind: t.letterKind, paper: t.paper, headerLayout: t.headerLayout, language: t.language,
  showNtnStrn: t.showNtnStrn, showFbrQr: t.showFbrQr, showHsCodes: t.showHsCodes, showItemImages: t.showItemImages,
  showAmountInWords: t.showAmountInWords, showBankDetails: t.showBankDetails, bodyHtml: t.bodyHtml,
});

/** Template app/settings/templates: template cards, editor with "show on document" options, live preview. */
export function TemplatesScreen({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const lookups = useLookups(LOOKUPS);
  const [rows, setRows] = useState<DocumentTemplate[] | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sel, setSel] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errs, setErrs] = useState<Record<string, string[]>>({});
  const [view, setView] = useState<"layout" | "fields" | "html">("layout");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [history, setHistory] = useState(false);
  const paper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listTemplates(), listDocumentTypes(), getCompanySettings()])
      .then(([t, d, c]) => {
        if (cancelled) return;
        setRows(t);
        setTypes(d);
        setCompany(c);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load templates" }));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const current = rows?.find((t) => t.id === sel) ?? null;
  const open = (t: DocumentTemplate | "new") => {
    setSel(t === "new" ? "new" : t.id);
    setForm(t === "new" ? blank() : toForm(t));
    setErrs({});
  };
  if (rows?.length && sel === null) open(rows.find((t) => t.isDefault) ?? rows[0]!);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setErrs({});
    try {
      const saved = current ? await updateTemplate(current.id, { ...form, rowVersion: current.rowVersion }) : await createTemplate(form);
      toast(current ? `${saved.name} saved · version ${saved.version}` : `${saved.name} created`, { tone: "good" });
      setRows((r) => (r ? [...r.filter((x) => x.id !== saved.id), saved] : r));
      setSel(saved.id);
      setForm(toForm(saved));
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrs(e.details);
      toast(e instanceof ApiError && e.code === "DB_UNIQUE_VIOLATION" ? "Another template already has this name" : e instanceof ApiError ? e.message : "Could not save", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: "set-default" | "activate" | "deactivate") => {
    if (!current) return;
    try {
      const t = await templateAction(current.id, action, current.rowVersion);
      toast(action === "set-default" ? `${t.name} is now the default` : action === "activate" ? `${t.name} activated` : `${t.name} archived`, { tone: "good" });
      setAttempt((n) => n + 1);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not update", { tone: "danger" });
    }
  };
  const remove = async () => {
    if (!current) return;
    try {
      await deleteTemplate(current.id, current.rowVersion);
      toast(`${current.name} deleted`, { tone: "good" });
      setRemoving(false);
      setSel(null);
      setForm(null);
      setAttempt((n) => n + 1);
    } catch (e) {
      setRemoving(false);
      toast(e instanceof ApiError ? e.message : "Could not delete", { tone: "danger" });
    }
  };
  /** Prints only the preview (template "Test print"). */
  const print = () => {
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w || !paper.current) return;
    w.document.write(`<!doctype html><html><head><title>${form?.name ?? "Template"}</title>${[...document.querySelectorAll('link[rel="stylesheet"],style')].map((n) => n.outerHTML).join("")}</head><body style="background:#fff;padding:24px">${paper.current.outerHTML}</body></html>`);
    w.document.close();
    w.addEventListener("load", () => w.print());
  };

  const cats = [...new Set((rows ?? []).map((t) => t.category))];
  const list = (rows ?? []).filter((t) => (cat === "all" || t.category === cat) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
  const docName = (code: string | null) => types.find((t) => t.code === code)?.name ?? code ?? "";
  const title = form ? (form.category === "HR_LETTER" ? labelOf(lookups, "LetterKind", form.letterKind) : docName(form.docType)).toUpperCase() : "";
  const err = (k: string) => errs[k]?.[0];

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Settings / Document Templates</div><h1>Document Templates</h1><p>Print and PDF layouts for invoices, vouchers, payslips and HR letters.</p></div>
        <div className="head-actions">
          {current && <Button icon={<History />} onClick={() => setHistory(true)}>History</Button>}
          {canEdit && <Button variant="primary" icon={<Plus />} onClick={() => open("new")}>New template</Button>}
        </div>
      </div>

      {error ? <ErrorState {...error} onRetry={() => setAttempt((n) => n + 1)} /> : !rows ? <Skeleton style={{ height: 420, borderRadius: 18 }} /> : (
        <>
          <div className="toolbar">
            <label className="search-field"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search templates…" /></label>
            <div className="chips">
              <button type="button" className={cat === "all" ? "active" : undefined} onClick={() => setCat("all")}>All <i>{rows.length}</i></button>
              {cats.map((c) => <button key={c} type="button" className={cat === c ? "active" : undefined} onClick={() => setCat(c)}>{labelOf(lookups, "DocumentTemplateCategory", c)} <i>{rows.filter((t) => t.category === c).length}</i></button>)}
            </div>
          </div>

          {rows.length || sel === "new" ? (
            <div className="card-grid mb">
              {list.map((t) => (
                <button key={t.id} type="button" className="card" style={{ textAlign: "left", outline: t.id === sel ? "2px solid var(--primary)" : undefined }} onClick={() => open(t)}>
                  <div className="paper" style={{ height: 150, overflow: "hidden", fontSize: 9, padding: 12 }}>
                    {t.category === "HR_LETTER" ? <b>{labelOf(lookups, "LetterKind", t.letterKind)}</b> : <div className="paper-head"><b>{(company?.tradingName ?? company?.legalName ?? "COMPANY").toUpperCase().slice(0, 14)}</b><b style={{ color: "var(--primary)" }}>{docName(t.docType).toUpperCase()}</b></div>}
                    <div className="skeleton" style={{ height: 6, width: "70%", margin: "6px 0" }} /><div className="skeleton" style={{ height: 6, width: "45%" }} />
                    <div className="skeleton" style={{ height: 40, marginTop: 10 }} />
                  </div>
                  <div className="row mt">
                    <div><b>{t.name}</b><small className="muted" style={{ display: "block" }}>{t.category === "HR_LETTER" ? `HR letter · ${labelOf(lookups, "LetterKind", t.letterKind)}` : `${docName(t.docType)} · ${labelOf(lookups, "Paper", t.paper)}`}</small></div><span className="spacer" />
                    {t.isDefault ? <Badge tone="good">Default</Badge> : t.status === "ARCHIVED" ? <Badge>Archived</Badge> : <Badge>v{t.version}</Badge>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Panel><EmptyState icon={<FileText />} title="No document templates yet" description="Create the print layout for sales invoices, vouchers, payslips or HR letters." action={canEdit && <Button variant="primary" size="sm" icon={<Plus />} onClick={() => open("new")}>New template</Button>} /></Panel>
          )}

          {form && (
            <div className="split-doc">
              <div className="panel">
                <div className="panel-head">
                  <div><h3>Editor{form.name ? ` — ${form.name}` : ""}</h3><p>{current ? `Version ${current.version} · ${labelOf(lookups, "DocumentTemplateStatus", current.status)}${current.isDefault ? " · default" : ""}` : "New template"}</p></div>
                  <div className="panel-actions"><div className="seg">{(["layout", "fields", "html"] as const).map((v) => <button key={v} type="button" className={view === v ? "active" : undefined} onClick={() => setView(v)}>{v === "html" ? "HTML" : v[0]!.toUpperCase() + v.slice(1)}</button>)}</div></div>
                </div>
                <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                  {view === "layout" && (
                    <>
                      <div className="form-grid">
                        <label className="full"><span>Template name *</span><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sales Invoice — Standard GST" />{err("name") && <small className="hint text-danger">{err("name")}</small>}</label>
                        <label><span>Category</span><select value={form.category} onChange={(e) => { const c = e.target.value; setForm((f) => (f ? { ...f, category: c, letterKind: c === "HR_LETTER" ? (f.letterKind ?? "OFFER") : null, docType: c === "HR_LETTER" ? null : (f.docType ?? "INV") } : f)); }}>{lookupOptions(lookups, "DocumentTemplateCategory", form.category).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
                        {form.category === "HR_LETTER" ? (
                          <label><span>Letter</span><select value={form.letterKind ?? ""} onChange={(e) => set("letterKind", e.target.value)}>{lookupOptions(lookups, "LetterKind", form.letterKind).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select>{err("letterKind") && <small className="hint text-danger">{err("letterKind")}</small>}</label>
                        ) : (
                          <label><span>Document type</span><select value={form.docType ?? ""} onChange={(e) => set("docType", e.target.value)}>{types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>{err("docType") && <small className="hint text-danger">{err("docType")}</small>}</label>
                        )}
                        <label><span>Paper</span><select value={form.paper} onChange={(e) => set("paper", e.target.value)}>{lookupOptions(lookups, "Paper", form.paper).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
                        <label><span>Header</span><select value={form.headerLayout} onChange={(e) => set("headerLayout", e.target.value)}>{lookupOptions(lookups, "HeaderLayout", form.headerLayout).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
                        <label><span>Language</span><select value={form.language} onChange={(e) => set("language", e.target.value)}>{lookupOptions(lookups, "DocumentTemplateLanguage", form.language).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></label>
                      </div>
                      <div className="form-section mt"><h4>Show on document</h4></div>
                      <div className="grid-2">
                        {TEMPLATE_FLAGS.map((f) => <label key={f.key} className="check"><input type="checkbox" checked={form[f.key]} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>)}
                      </div>
                    </>
                  )}
                  {view === "fields" && (
                    <>
                      <div className="form-section"><h4>Merge fields</h4><p>Click to add a field to the body (HTML view).</p></div>
                      <div className="row" style={{ flexWrap: "wrap" }}>
                        {MERGE_FIELDS.map((m) => <button key={m} type="button" className="badge neutral" onClick={() => { set("bodyHtml", `${form.bodyHtml ?? ""}${m}`); toast(`${m} added to the body`, { tone: "info", ms: 1200 }); }}>{m}</button>)}
                      </div>
                    </>
                  )}
                  {view === "html" && (
                    <label className="full" style={{ display: "grid", gap: 6 }}><span>Body (HTML, optional)</span><textarea rows={12} value={form.bodyHtml ?? ""} onChange={(e) => set("bodyHtml", e.target.value)} placeholder="Leave empty to use the standard layout. Merge fields like {{invoice.number}} are filled in when printing." style={{ fontFamily: "ui-monospace,monospace", fontSize: 12 }} /></label>
                  )}
                </fieldset>
                {canEdit && (
                  <div className="form-actions">
                    {current && !current.isDefault && <Button variant="ghost" className="text-danger" onClick={() => setRemoving(true)}>Delete</Button>}
                    {current && !current.isDefault && (current.status === "ARCHIVED" ? <Button variant="ghost" onClick={() => act("activate")}>Activate</Button> : <Button variant="ghost" onClick={() => act("deactivate")}>Archive</Button>)}
                    {current && !current.isDefault && <Button icon={<Star />} onClick={() => act("set-default")}>Make default</Button>}
                    <Button onClick={() => (current ? setForm(toForm(current)) : setForm(blank()))}>Reset</Button>
                    <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save template"}</Button>
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-head"><div><h3>Live preview</h3></div><div className="panel-actions"><Button variant="ghost" size="sm" icon={<Printer />} onClick={print}>Test print</Button></div></div>
                <div className="paper" ref={paper}>
                  <div className="paper-head" style={form.headerLayout === "CENTERED_LETTERHEAD" ? { flexDirection: "column", alignItems: "center", textAlign: "center" } : undefined}>
                    <div className="row">
                      <span className="avatar">{initialsOf(company?.legalName || "Company") || "CO"}</span>
                      <div><b>{company?.legalName || "Your company"}</b>{form.showNtnStrn && <><br /><small className="muted">NTN {company?.ntn || "—"}{company?.strn ? ` · STRN ${company.strn}` : ""}</small></>}</div>
                    </div>
                    <div className={form.headerLayout === "CENTERED_LETTERHEAD" ? undefined : "right"}><b style={{ color: "var(--primary)" }}>{title}</b><br /><small>{form.docType ? `${form.docType}-0001` : ""}</small></div>
                  </div>
                  {form.category === "HR_LETTER" ? (
                    <div className="mt small" style={{ lineHeight: 1.7 }}><p>Date: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p><p>To whom it may concern,</p><p>This is to certify that <b>{"{{employee.name}}"}</b>, {"{{employee.designation}}"}, …</p></div>
                  ) : (
                    <>
                      <div className="paper-meta"><div><span className="small muted">Bill to</span><br /><b>Customer name</b><br /><small className="muted">Address</small></div><div className="right"><span className="small muted">Date / Due</span><br /><b>{new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</b></div></div>
                      <table className="tbl"><thead><tr><th>Item</th>{form.showHsCodes && <th>HS code</th>}<th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
                        <tbody><tr><td>{form.showItemImages ? "▣ " : ""}Sample item</td>{form.showHsCodes && <td>0000.0000</td>}<td className="num">10</td><td className="num">1,000.00</td><td className="num">10,000.00</td></tr></tbody></table>
                      <div className="paper-totals"><div><span>Subtotal</span><b>10,000.00</b></div><div><span>GST 18%</span><b>1,800.00</b></div><div><span>Total</span><b>Rs 11,800</b></div></div>
                      {form.showAmountInWords && <p className="small muted">Eleven thousand eight hundred rupees only.</p>}
                    </>
                  )}
                  <div className="paper-foot small muted">{[form.showFbrQr && "FBR Invoice # ……", form.showBankDetails && "Bank details", "Thank you for your business."].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={remove} danger title={`Delete ${current?.name}?`} confirmLabel="Delete">The template is removed from the list; its history is kept.</ConfirmDialog>
      {current && (
        <Drawer open={history} onClose={() => setHistory(false)} title={`${current.name} history`} subtitle="Every saved change, who made it and what changed" wide>
          <HistoryTab schema="Company" table="DocumentTemplates" id={current.id} />
        </Drawer>
      )}
    </>
  );
}

