"use client";

import { Archive, Megaphone, Pin, PinOff, Plus, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Announcement, AnnouncementOptions } from "@/shared/self-service/announcement";
import { cn } from "@/components/ui/cn";
import { Check, Field, FormGrid } from "@/components/ui/form";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { RecordModal } from "@/features/hr/components/record-modal";
import { labelOf, lookupOptions, toneOf, useLookups } from "@/features/settings/use-lookups";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { announcementOptions, archiveAnnouncement, createAnnouncement, listAnnouncements, pinAnnouncement, publishAnnouncement, updateAnnouncement } from "../api";
import { dateTime, fromLocalInput, kindIcon, toLocalInput } from "./ess-ui";

type Can = { create: boolean; edit: boolean };
type Form = Record<string, string | boolean>;
const STATUSES = ["", "DRAFT", "PUBLISHED", "ARCHIVED"];

/**
 * Workforce › Employee engagement › Announcements. No admin template exists, so this is template style (page head,
 * status chips, table, editor modal with History). Drafts are edited, published (optionally until an expiry), pinned
 * and archived; published announcements are never edited or deleted.
 */
export function AnnouncementsScreen({ can }: { can: Can }) {
  const toast = useToast();
  const lookups = useLookups(["CompanyAnnouncementKind", "CompanyAnnouncementStatus"]);
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [opts, setOpts] = useState<AnnouncementOptions>({ branches: [], departments: [], policies: [] });
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<Announcement | "new" | null>(null);
  const [f, setF] = useState<Form>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAnnouncements(), announcementOptions()])
      .then(([r, o]) => { if (!cancelled) { setRows(r); setOpts(o); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load announcements" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const row = edit && edit !== "new" ? edit : null;
  const draft = !row || row.status === "DRAFT";
  const s = (k: string) => String(f[k] ?? "");
  const set = (k: string, v: string | boolean) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: "" })); };
  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErrs({});
    try { await work(); toast(done, { tone: "good" }); setEdit(null); reload(); } catch (e) { setErrs(apiFieldErrors(e)); toast(apiMessage(e, "Could not save the announcement"), { tone: "danger" }); } finally { setBusy(false); }
  };
  const open = (a: Announcement | "new") => {
    setErrs({});
    setEdit(a);
    setF(a === "new"
      ? { title: "", summary: "", body: "", kind: "GENERAL", authorLabel: "", eventAt: "", venue: "", requiresRsvp: false, branchId: "", departmentId: "", policyDocumentId: "", isPinned: false, expiresAt: "" }
      : { title: a.title, summary: a.summary ?? "", body: a.body ?? "", kind: a.kind, authorLabel: a.authorLabel ?? "", eventAt: toLocalInput(a.eventAt), venue: a.venue ?? "", requiresRsvp: a.requiresRsvp,
          branchId: a.branch?.id ?? "", departmentId: a.department?.id ?? "", policyDocumentId: a.policy?.id ?? "", isPinned: a.isPinned, expiresAt: toLocalInput(a.expiresAt) });
  };
  const body = () => ({
    title: s("title"), summary: s("summary"), body: s("body"), kind: s("kind"), authorLabel: s("authorLabel"), eventAt: fromLocalInput(s("eventAt")), venue: s("venue"),
    requiresRsvp: Boolean(f.requiresRsvp), branchId: s("branchId"), departmentId: s("departmentId"), policyDocumentId: s("policyDocumentId"), isPinned: Boolean(f.isPinned), expiresAt: fromLocalInput(s("expiresAt")),
  });
  const save = () => run(() => (row ? updateAnnouncement(row.id, { ...body(), rowVersion: row.rowVersion }) : createAnnouncement(body())), row ? "Draft saved" : "Draft created");
  const publish = () => run(async () => {
    // Save the draft's edits first, then publish the saved version.
    const saved = row ? await updateAnnouncement(row.id, { ...body(), rowVersion: row.rowVersion }) : await createAnnouncement(body());
    await publishAnnouncement(saved.id, { rowVersion: saved.rowVersion, expiresAt: fromLocalInput(s("expiresAt")) });
  }, "Announcement published");

  if (error) return <><PageHead eyebrow="Workforce / Employee engagement / Announcements" title="Announcements" /><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></>;
  const shown = (rows ?? []).filter((a) => !status || a.status === status);
  const count = (st: string) => (rows ?? []).filter((a) => !st || a.status === st).length;

  return (
    <>
      <PageHead eyebrow="Workforce / Employee engagement / Announcements" title="Announcements"
        description="Company news for the employee feed on My Profile › Directory: for everyone, or one branch or department."
        actions={can.create && <button className="btn primary" type="button" onClick={() => open("new")}><Plus />New announcement</button>} />

      <div className="panel flush">
        <div className="panel-head" style={{ padding: "14px 16px" }}>
          <div className="chips">{STATUSES.map((st) => <button key={st || "all"} type="button" className={cn(status === st && "active")} onClick={() => setStatus(st)}>{st ? labelOf(lookups, "CompanyAnnouncementStatus", st) : "All"} <i>{count(st)}</i></button>)}</div>
        </div>
        {!rows ? <div style={{ padding: 16 }}><Skeleton style={{ height: 220 }} /></div> : shown.length ? (
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Announcement</th><th>Kind</th><th>For</th><th>Published</th><th>Expires</th><th>Status</th></tr></thead>
            <tbody>{shown.map((a) => {
              const { Icon, tone } = kindIcon(a.kind);
              return (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => open(a)}>
                  <td><div className="row" style={{ gap: 10, flexWrap: "nowrap", minWidth: 260 }}><span className={cn("icon-tile", tone)} style={{ width: 32, height: 32, borderRadius: 10 }}><Icon style={{ width: 16, height: 16 }} /></span><div><b>{a.isPinned && <Pin style={{ width: 12, height: 12, marginRight: 4, verticalAlign: -1 }} aria-label="Pinned" />}{a.title}</b><div className="small muted">{a.authorLabel ?? ""}{a.summary ? ` · ${a.summary}` : ""}</div></div></div></td>
                  <td><span className={cn("badge", toneOf(lookups, "CompanyAnnouncementKind", a.kind))}>{labelOf(lookups, "CompanyAnnouncementKind", a.kind)}</span></td>
                  <td className="small">{[a.branch?.name, a.department?.name].filter(Boolean).join(" · ") || "Everyone"}</td>
                  <td className="small">{dateTime(a.publishedAt)}</td>
                  <td className="small">{a.expiresAt ? dateTime(a.expiresAt) : "—"}</td>
                  <td><span className={cn("badge dot", a.isExpired ? "neutral" : toneOf(lookups, "CompanyAnnouncementStatus", a.status))}>{a.isExpired ? "Expired" : labelOf(lookups, "CompanyAnnouncementStatus", a.status)}</span></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        ) : <EmptyState icon={<Megaphone />} title={status ? "Nothing here" : "No announcements yet"} description={can.create ? "Write a draft, then publish it to the employee feed." : "HR's announcements appear here."} />}
      </div>

      {edit && (
        <RecordModal open onClose={() => setEdit(null)} busy={busy} wide title={row ? row.title : "New announcement"}
          subtitle={draft ? "Drafts are private to HR until published." : `${labelOf(lookups, "CompanyAnnouncementStatus", row!.status)} · published content is not edited; archive it instead.`}
          history={row ? { schema: "EmployeeSelfService", table: "CompanyAnnouncements", id: row.id } : null}
          canSave={draft && (row ? can.edit : can.create)} saveLabel={row ? "Save draft" : "Save as draft"} onSave={save}>
          <FormGrid>
            <Field label="Title" required full error={errs.title}><input value={s("title")} maxLength={160} disabled={!draft} placeholder="e.g. Q2 sales kick-off · 05 Oct" onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Kind" error={errs.kind}><select value={s("kind")} disabled={!draft} onChange={(e) => set("kind", e.target.value)}>{lookupOptions(lookups, "CompanyAnnouncementKind", s("kind")).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}</select></Field>
            <Field label="From" error={errs.authorLabel} hint="The author employee becomes selectable after Phase 11"><input value={s("authorLabel")} maxLength={80} disabled={!draft} placeholder="Your name, or e.g. HR" onChange={(e) => set("authorLabel", e.target.value)} /></Field>
            <Field label="Summary" full error={errs.summary} hint="One line under the title in the feed"><input value={s("summary")} maxLength={240} disabled={!draft} onChange={(e) => set("summary", e.target.value)} /></Field>
            <Field label="Message" full error={errs.body}><textarea rows={5} value={s("body")} maxLength={5000} disabled={!draft} onChange={(e) => set("body", e.target.value)} /></Field>
            <Field label="Branch" error={errs.branchId}><select value={s("branchId")} disabled={!draft} onChange={(e) => set("branchId", e.target.value)}><option value="">All branches</option>{opts.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            <Field label="Department" error={errs.departmentId}><select value={s("departmentId")} disabled={!draft} onChange={(e) => set("departmentId", e.target.value)}><option value="">All departments</option>{opts.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            {(s("kind") === "EVENT" || s("eventAt")) && <>
              <Field label="Event date & time" error={errs.eventAt}><input type="datetime-local" value={s("eventAt")} disabled={!draft} onChange={(e) => set("eventAt", e.target.value)} /></Field>
              <Field label="Venue" error={errs.venue}><input value={s("venue")} maxLength={120} disabled={!draft} onChange={(e) => set("venue", e.target.value)} /></Field>
              <Check full label="Ask for RSVP (responses arrive in Phase 34)" checked={Boolean(f.requiresRsvp)} disabled={!draft} onChange={(e) => set("requiresRsvp", e.target.checked)} />
            </>}
            {(s("kind") === "POLICY_UPDATE" || s("policyDocumentId")) && (
              <Field label="Policy" full error={errs.policyDocumentId} hint={opts.policies.length ? undefined : "Published policies (Phase 13) appear here"}>
                <select value={s("policyDocumentId")} disabled={!draft} onChange={(e) => set("policyDocumentId", e.target.value)}><option value="">None</option>{opts.policies.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
              </Field>
            )}
            <Field label="Expires" error={errs.expiresAt} hint="Leaves the feed after this time"><input type="datetime-local" value={s("expiresAt")} disabled={!draft} onChange={(e) => set("expiresAt", e.target.value)} /></Field>
            {draft && <Check label="Pin to the top of the feed" checked={Boolean(f.isPinned)} onChange={(e) => set("isPinned", e.target.checked)} />}
            {row && <div className="full small muted">Created {dateTime(row.createdAt)}{row.publishedAt ? ` · published ${dateTime(row.publishedAt)}` : ""}{row.isExpired ? " · expired" : ""}</div>}
            {can.edit && row?.status !== "ARCHIVED" && (
              <div className="full row" style={{ gap: 8, flexWrap: "wrap" }}>
                {draft && <button type="button" className="btn primary sm" disabled={busy || !s("title").trim()} onClick={publish}><Send />Publish now</button>}
                {row && !draft && <button type="button" className="btn secondary sm" disabled={busy} onClick={() => run(() => pinAnnouncement(row.id, !row.isPinned, row.rowVersion), row.isPinned ? "Unpinned" : "Pinned to the top")}>{row.isPinned ? <><PinOff />Unpin</> : <><Pin />Pin</>}</button>}
                {row && <button type="button" className="btn ghost sm" disabled={busy} onClick={() => run(() => archiveAnnouncement(row.id, row.rowVersion), "Announcement archived")}><Archive />Archive</button>}
              </div>
            )}
          </FormGrid>
        </RecordModal>
      )}
    </>
  );
}
