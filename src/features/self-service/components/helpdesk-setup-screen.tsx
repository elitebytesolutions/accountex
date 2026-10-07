"use client";

import { BookOpen, Clock, LifeBuoy, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { HELPDESK_ICONS, type HelpdeskCategory, type HelpdeskFaq } from "@/shared/self-service/helpdesk";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { RecordModal } from "@/features/hr/components/record-modal";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import {
  createHelpdeskCategory, createHelpdeskFaq, deleteHelpdeskCategory, deleteHelpdeskFaq, listHelpdeskCategories, listHelpdeskFaqs,
  setHelpdeskCategoryActive, setHelpdeskFaqPublished, updateHelpdeskCategory, updateHelpdeskFaq,
} from "../api";
import { DESK_ICONS, deskIcon } from "./ess-ui";

type Can = { create: boolean; edit: boolean; remove: boolean };
type Form = Record<string, string | boolean>;
const words = (s: string) => s.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);

/**
 * Workforce › Employee engagement › Helpdesk setup. No admin template exists, so this is template style (page head, KPI
 * cards, a tabbed panel with tables, the hrc-add modal with History): the desks employees raise tickets to, and the
 * "Quick answers" they search on My Profile › Helpdesk.
 */
export function HelpdeskSetupScreen({ can }: { can: Can }) {
  const toast = useToast();
  const [cats, setCats] = useState<HelpdeskCategory[] | null>(null);
  const [faqs, setFaqs] = useState<HelpdeskFaq[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<"desks" | "faqs">("desks");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ kind: "cat"; row: HelpdeskCategory | null } | { kind: "faq"; row: HelpdeskFaq | null } | null>(null);
  const [f, setF] = useState<Form>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listHelpdeskCategories(), listHelpdeskFaqs()])
      .then(([c, x]) => { if (!cancelled) { setCats(c); setFaqs(x); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the helpdesk setup" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string, close = true) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); if (close) setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save"), { tone: "danger" }); } finally { setBusy(false); }
  };

  const openCat = (row: HelpdeskCategory | null) => {
    setErrs({});
    setEdit({ kind: "cat", row });
    setF(row
      ? { code: row.code, name: row.name, description: row.description ?? "", slaHours: String(row.slaHours), highPrioritySlaFactor: String(row.highPrioritySlaFactor), routingKeywords: row.routingKeywords.join(", "), icon: row.icon ?? "", sortOrder: String(row.sortOrder) }
      : { code: "", name: "", description: "", slaHours: "24", highPrioritySlaFactor: "0.5", routingKeywords: "", icon: "life-buoy", sortOrder: String((cats?.length ?? 0) + 1) });
  };
  const openFaq = (row: HelpdeskFaq | null) => {
    setErrs({});
    setEdit({ kind: "faq", row });
    setF(row
      ? { categoryId: row.category.id, question: row.question, answer: row.answer, keywords: row.keywords.join(", "), sortOrder: String(row.sortOrder), isPublished: row.isPublished }
      : { categoryId: cats?.find((c) => c.status === "ACTIVE")?.id ?? "", question: "", answer: "", keywords: "", sortOrder: "0", isPublished: true });
  };
  const saveCat = (row: HelpdeskCategory | null) => {
    const body = { code: s("code"), name: s("name"), description: s("description"), slaHours: s("slaHours"), highPrioritySlaFactor: s("highPrioritySlaFactor"), routingKeywords: words(s("routingKeywords")), icon: s("icon"), sortOrder: s("sortOrder") };
    return run(() => (row ? updateHelpdeskCategory(row.id, { ...body, rowVersion: row.rowVersion }) : createHelpdeskCategory(body)), row ? `${s("name")} saved` : "Desk added");
  };
  const saveFaq = (row: HelpdeskFaq | null) => {
    const body = { categoryId: s("categoryId"), question: s("question"), answer: s("answer"), keywords: words(s("keywords")), sortOrder: s("sortOrder"), isPublished: Boolean(f.isPublished) };
    return run(() => (row ? updateHelpdeskFaq(row.id, { ...body, rowVersion: row.rowVersion }) : createHelpdeskFaq(body)), row ? "Answer saved" : "Answer added");
  };

  if (error) return <><PageHead eyebrow="Workforce / Employee engagement / Helpdesk setup" title="Helpdesk setup" /><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></>;

  const active = cats?.filter((c) => c.status === "ACTIVE") ?? [];
  const query = q.trim().toLowerCase();
  const shownFaqs = (faqs ?? []).filter((x) => !query || `${x.question} ${x.answer} ${x.category.name} ${x.keywords.join(" ")}`.toLowerCase().includes(query));
  const shownCats = (cats ?? []).filter((x) => !query || `${x.code} ${x.name} ${x.description ?? ""} ${x.routingKeywords.join(" ")}`.toLowerCase().includes(query));
  const fastest = active.length ? Math.min(...active.map((c) => c.slaHours)) : null;
  const catRow = edit?.kind === "cat" ? edit.row : null;
  const faqRow = edit?.kind === "faq" ? edit.row : null;

  return (
    <>
      <PageHead eyebrow="Workforce / Employee engagement / Helpdesk setup" title="Helpdesk setup"
        description="The desks employees raise tickets to (with their reply SLA and routing keywords) and the quick answers they search before asking."
        actions={<>
          {can.create && <button className="btn secondary" type="button" onClick={() => openFaq(null)} disabled={!active.length}><BookOpen />Add answer</button>}
          {can.create && <button className="btn primary" type="button" onClick={() => openCat(null)}><Plus />Add desk</button>}
        </>} />

      <div className="kpi-grid mb">
        <div className="kpi"><div className="kpi-top"><span>Active desks</span><span className="icon-well"><LifeBuoy /></span></div><strong>{cats ? active.length : "—"}</strong><small>{cats ? `${cats.length - active.length} inactive` : "Loading…"}</small></div>
        <div className="kpi teal"><div className="kpi-top"><span>Fastest reply SLA</span><span className="icon-well"><Clock /></span></div><strong>{fastest !== null ? `${fastest}h` : "—"}</strong><small>{fastest !== null ? active.find((c) => c.slaHours === fastest)?.name : "No desks"}</small></div>
        <div className="kpi violet"><div className="kpi-top"><span>Quick answers</span><span className="icon-well"><BookOpen /></span></div><strong>{faqs ? faqs.filter((x) => x.isPublished).length : "—"}</strong><small>{faqs ? `${faqs.filter((x) => !x.isPublished).length} hidden` : "Loading…"}</small></div>
      </div>

      <div className="panel flush">
        <div className="panel-head" style={{ padding: "14px 16px 0" }}>
          <Tabs items={[{ key: "desks", label: "Desks", count: cats?.length }, { key: "faqs", label: "Quick answers", count: faqs?.length }]} active={tab} onChange={(k) => setTab(k)} />
          <div className="panel-actions"><label className="search-field" data-plain-search><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "desks" ? "Search desks…" : "Search answers…"} aria-label="Search" /></label></div>
        </div>
        {!cats || !faqs ? <div style={{ padding: 16 }}><Skeleton style={{ height: 220 }} /></div> : tab === "desks" ? (
          shownCats.length ? (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Desk</th><th>Code</th><th className="num">Reply SLA</th><th className="num">High priority</th><th>Routing keywords</th><th>Owner</th><th className="num">Answers</th><th>Status</th></tr></thead>
              <tbody>{shownCats.map((c) => {
                const { Icon, tone } = deskIcon(c.icon);
                return (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => openCat(c)}>
                    <td><div className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 240 }}><span className={cn("icon-tile", tone)} style={{ width: 32, height: 32, borderRadius: 10 }}><Icon style={{ width: 16, height: 16 }} /></span><div><b>{c.name}</b><div className="small muted">{c.description}</div></div></div></td>
                    <td><code>{c.code}</code></td>
                    <td className="num">{c.slaHours}h</td>
                    <td className="num">{Math.round(c.slaHours * c.highPrioritySlaFactor * 100) / 100}h</td>
                    <td className="small">{c.routingKeywords.join(", ") || "—"}</td>
                    <td className="small muted" title="Employees become selectable once Phase 11 is accepted">after Phase 11</td>
                    <td className="num">{c.faqCount}</td>
                    <td><span className={cn("badge dot", c.status === "ACTIVE" ? "good" : "neutral")}>{c.status === "ACTIVE" ? "Active" : "Inactive"}</span></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          ) : <EmptyState icon={<LifeBuoy />} title={query ? "No desks match" : "No desks yet"} description={can.create ? "Add the desks employees raise tickets to." : "HR adds the helpdesk desks."} />
        ) : shownFaqs.length ? (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Question</th><th>Desk</th><th>Keywords</th><th className="num">Order</th><th>Status</th></tr></thead>
            <tbody>{shownFaqs.map((x) => (
              <tr key={x.id} style={{ cursor: "pointer" }} onClick={() => openFaq(x)}>
                <td><b>{x.question}</b><div className="small muted" style={{ maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.answer}</div></td>
                <td><span className="badge neutral">{x.category.name}</span></td>
                <td className="small">{x.keywords.join(", ") || "—"}</td>
                <td className="num">{x.sortOrder}</td>
                <td><span className={cn("badge dot", x.isPublished ? "good" : "neutral")}>{x.isPublished ? "Published" : "Hidden"}</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon={<BookOpen />} title={query ? "No answers match" : "No quick answers yet"} description={can.create ? "Add answers to the questions employees ask most." : "HR adds the quick answers."} />}
      </div>

      {edit?.kind === "cat" && (
        <RecordModal open onClose={() => setEdit(null)} busy={busy} title={catRow ? `Edit ${catRow.name}` : "Add desk"} subtitle="Tickets to this desk get its reply SLA (shorter for high priority)."
          history={catRow ? { schema: "EmployeeSelfService", table: "HelpdeskCategories", id: catRow.id } : null}
          active={catRow?.status === "ACTIVE"} canSave={catRow ? can.edit : can.create} canToggle={can.edit} canDelete={can.remove} saveLabel={catRow ? "Save" : "Add desk"}
          onSave={() => saveCat(catRow)}
          onToggle={() => catRow && run(() => setHelpdeskCategoryActive(catRow.id, catRow.status !== "ACTIVE", catRow.rowVersion), `${catRow.name} ${catRow.status === "ACTIVE" ? "deactivated" : "activated"}`)}
          onDelete={async () => { if (catRow) await run(() => deleteHelpdeskCategory(catRow.id, catRow.rowVersion), `${catRow.name} deleted`); }}
          deleteNote="Desks that answers or tickets use can only be deactivated.">
          <FormGrid>
            <Field label="Desk name" required error={errs.name}><input value={s("name")} maxLength={60} placeholder="e.g. Payroll" onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Code" required error={errs.code} hint="Never reused once deleted"><input value={s("code")} maxLength={20} placeholder="PAYROLL" onChange={(e) => set("code", e.target.value.toUpperCase())} /></Field>
            <Field label="What it covers" full error={errs.description}><input value={s("description")} maxLength={200} placeholder="Salary, commission, tax, deductions" onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Reply SLA (hours)" required error={errs.slaHours}><input type="number" min={1} step="0.5" value={s("slaHours")} onChange={(e) => set("slaHours", e.target.value)} /></Field>
            <Field label="High-priority factor" error={errs.highPrioritySlaFactor} hint={`High priority: ${Math.round(Number(s("slaHours") || 0) * Number(s("highPrioritySlaFactor") || 0) * 100) / 100}h`}>
              <select value={s("highPrioritySlaFactor")} onChange={(e) => set("highPrioritySlaFactor", e.target.value)}>
                {["1", "0.75", "0.5", "0.25"].map((v) => <option key={v} value={v}>{v === "1" ? "Same as normal" : `× ${v}`}</option>)}
                {!["1", "0.75", "0.5", "0.25"].includes(s("highPrioritySlaFactor")) && <option value={s("highPrioritySlaFactor")}>× {s("highPrioritySlaFactor")}</option>}
              </select>
            </Field>
            <Field label="Routing keywords" full error={errs.routingKeywords} hint="Comma-separated. A ticket subject with one of these words is routed to this desk."><input value={s("routingKeywords")} placeholder="salary, commission, payslip" onChange={(e) => set("routingKeywords", e.target.value)} /></Field>
            <Field label="Icon" error={errs.icon}><select value={s("icon")} onChange={(e) => set("icon", e.target.value)}>{HELPDESK_ICONS.map((i) => <option key={i} value={i}>{DESK_ICONS[i]?.label ?? i}</option>)}</select></Field>
            <Field label="Order" error={errs.sortOrder}><input type="number" min={0} max={999} value={s("sortOrder")} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
            <Field label="Owner" full hint="Employees become selectable once Phase 11 is accepted."><select disabled><option>after Phase 11</option></select></Field>
          </FormGrid>
        </RecordModal>
      )}

      {edit?.kind === "faq" && (
        <RecordModal open onClose={() => setEdit(null)} busy={busy} title={faqRow ? "Edit answer" : "Add answer"} subtitle="Shown under Quick answers on My Profile › Helpdesk while published." wide
          history={faqRow ? { schema: "EmployeeSelfService", table: "HelpdeskFaqs", id: faqRow.id } : null}
          active={faqRow?.isPublished} canSave={faqRow ? can.edit : can.create} canToggle={false} canDelete={can.remove} saveLabel={faqRow ? "Save" : "Add answer"}
          onSave={() => saveFaq(faqRow)}
          onDelete={async () => { if (faqRow) await run(() => deleteHelpdeskFaq(faqRow.id, faqRow.rowVersion), "Answer deleted"); }}
          deleteNote="The answer disappears from the helpdesk. Hide it instead to keep it for later.">
          <FormGrid>
            <Field label="Desk" required error={errs.categoryId}><select value={s("categoryId")} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Choose…</option>
              {(cats ?? []).filter((c) => c.status === "ACTIVE" || c.id === s("categoryId")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></Field>
            <Field label="Order" error={errs.sortOrder}><input type="number" min={0} max={999} value={s("sortOrder")} onChange={(e) => set("sortOrder", e.target.value)} /></Field>
            <Field label="Question" required full error={errs.question}><input value={s("question")} maxLength={200} placeholder="When is salary credited?" onChange={(e) => set("question", e.target.value)} /></Field>
            <Field label="Answer" required full error={errs.answer}><textarea rows={4} value={s("answer")} maxLength={2000} onChange={(e) => set("answer", e.target.value)} /></Field>
            <Field label="Search keywords" full error={errs.keywords} hint="Comma-separated, helps employees find this answer."><input value={s("keywords")} placeholder="salary, credit, payday" onChange={(e) => set("keywords", e.target.value)} /></Field>
            <Check full label="Published (employees can see it)" checked={Boolean(f.isPublished)} onChange={(e) => set("isPublished", e.target.checked)} />
            {faqRow && can.edit && (
              <div className="full"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => setHelpdeskFaqPublished(faqRow.id, !faqRow.isPublished, faqRow.rowVersion), faqRow.isPublished ? "Answer hidden" : "Answer published")}>{faqRow.isPublished ? "Hide from employees" : "Publish now"}</button></div>
            )}
          </FormGrid>
        </RecordModal>
      )}
    </>
  );
}
