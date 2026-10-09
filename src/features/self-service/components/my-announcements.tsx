"use client";

import { Check, Mail, MapPin, MessageCircle, Phone, Pin, Search, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import type { MyAnnouncement } from "@/shared/self-service/announcement";
import type { AnnouncementRead, Directory, DirectoryPerson, Presence } from "@/shared/self-service/engagement-actions";
import { initialsOf } from "@/features/auth/initials";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { markAnnouncementRead, myAnnouncementReads, myDirectory, setMyPresence } from "@/features/ess-requests/engagement/api";
import { myAnnouncements } from "../api";
import { ago, dateTime, kindIcon } from "./ess-ui";

/** The second line of an announcement in the card: author · venue / summary (template ANN[3]). */
const subline = (a: MyAnnouncement) => [a.authorLabel, a.eventAt ? [a.venue, dateTime(a.eventAt)].filter(Boolean).join(" · ") : a.summary].filter(Boolean).join(" · ");
/** PresenceStatus → template dot class and label (STATUS / SLBL in 08-company). */
const DOT: Record<string, { cls: string; label: string }> = {
  AVAILABLE: { cls: "on", label: "Available" }, BUSY: { cls: "busy", label: "Busy" }, IN_FIELD: { cls: "field", label: "In the field" }, AWAY: { cls: "off", label: "Away" },
};
const statusLine = (p: Presence | null) => (p ? [p.message || DOT[p.status]?.label, p.locationLabel].filter(Boolean).join(" · ") : "No status set");
const dotOf = (p: Presence | null) => (p ? DOT[p.status]?.cls ?? "off" : "off");
const RSVP: [string, string][] = [["YES", "Going"], ["MAYBE", "Maybe"], ["NO", "Can’t make it"]];
type Err = { message: string; reference?: string } | null;
const toErr = (e: unknown, fallback: string): Err => (e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: fallback });
const waLink = (m: string) => `https://wa.me/${m.replace(/\D/g, "").replace(/^0/, "92")}`;

/**
 * Template app/profile/directory (9C-ess.js 08-company): the people directory with presence dots, search and
 * department chips, the person drawer, the viewer's own status, and the Announcements card with read receipts / RSVP.
 */
export function MyAnnouncements() {
  const toast = useToast();
  const [dir, setDir] = useState<Directory | null>(null);
  const [dErr, setDErr] = useState<Err>(null);
  const [items, setItems] = useState<MyAnnouncement[] | null>(null);
  const [reads, setReads] = useState<AnnouncementRead[]>([]);
  const [error, setError] = useState<Err>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [open, setOpen] = useState<MyAnnouncement | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      myDirectory({ search: q.trim() || undefined, departmentId: dept || undefined })
        .then((d) => { if (!cancelled) { setDir(d); setDErr(null); } })
        .catch((e: unknown) => !cancelled && setDErr(toErr(e, "Could not load the directory")));
    }, q ? 250 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, dept, attempt]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([myAnnouncements(), myAnnouncementReads()])
      .then(([d, r]) => { if (!cancelled) { setItems(d); setReads(r); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(toErr(e, "Could not load announcements")));
    return () => { cancelled = true; };
  }, [attempt]);

  const readOf = (id: string) => reads.find((r) => r.announcementId === id);
  const unread = (items ?? []).filter((a) => !readOf(a.id)).length;
  const markRead = async (a: MyAnnouncement, rsvp?: string) => {
    try {
      const r = await markAnnouncementRead(a.id, rsvp);
      setReads((all) => [...all.filter((x) => x.announcementId !== a.id), r]);
      if (rsvp) toast(`RSVP saved · ${RSVP.find((x) => x[0] === rsvp)?.[1]}`, { tone: "good" });
    } catch (e) { toast(e instanceof ApiError ? e.message : "Could not save", { tone: "danger" }); }
  };
  const openAnn = (a: MyAnnouncement) => { setOpen(a); if (!readOf(a.id)) void markRead(a); };

  return (
    <>
      <PageHead eyebrow="My Profile / Directory" title="People Directory" description="Find colleagues across branches, and keep up with company news."
        actions={<button type="button" className="btn secondary" onClick={() => setStatusOpen(true)} disabled={!dir}>
          <i className={`es-dr-dot ${dotOf(dir?.mine ?? null)}`} />{dir?.mine ? DOT[dir.mine.status]?.label : "Set my status"}
        </button>} />

      <div className="es-grid es-main">
        <div className="es-col">
          <div className="es-card es-dr-bar">
            <div className="es-dr-tools">
              <div className="es-dr-sw"><label className="search-field es-dr-search"><Search /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or employee code…" aria-label="Search people" /></label></div>
              <span className="es-label">{dir ? `${dir.people.length} of ${dir.total} people` : ""}</span>
            </div>
            {dir && (
              <div className="chips es-dr-chips">
                <button type="button" className={dept ? "" : "active"} onClick={() => setDept("")}>All <i>{dir.total}</i></button>
                {dir.departments.map((d) => <button key={d.id} type="button" className={dept === d.id ? "active" : ""} onClick={() => setDept(d.id)}>{d.name} <i>{d.count}</i></button>)}
              </div>
            )}
          </div>
          {dErr ? <ErrorState message={dErr.message} reference={dErr.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !dir ? <div className="es-dr-grid"><Skeleton style={{ height: 200 }} /><Skeleton style={{ height: 200 }} /><Skeleton style={{ height: 200 }} /></div> : (
            <div className="es-dr-grid">
              {dir.people.length ? dir.people.map((p, i) => (
                <article key={p.id} className={`es-dr-card es-in${p.me ? " me" : ""}`} style={{ ["--i" as string]: i }} tabIndex={0} role="button" aria-label={p.name}
                  onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button")) setPerson(p); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPerson(p); } }}>
                  {p.me && <span className="es-dr-you">You</span>}
                  <div className="es-dr-avw"><span className="avatar lg">{initialsOf(p.name)}</span><i className={`es-dr-dot ${dotOf(p.presence)}`} title={p.presence ? DOT[p.presence.status]?.label : "No status"} /></div>
                  <b>{p.name}</b><span className="es-dr-role">{p.designation ?? p.code}</span>
                  <div className="es-dr-tags">{p.department && <span>{p.department}</span>}{p.branch && <span><MapPin />{p.branch}</span>}</div>
                  <small className={`es-dr-st ${dotOf(p.presence)}`}>{p.me && !p.presence ? "That’s you" : statusLine(p.presence)}</small>
                  <div className="es-dr-acts">
                    {p.mobile ? <button type="button" title={`Call ${p.mobile}`} aria-label="Call" onClick={() => { window.location.href = `tel:${p.mobile}`; }}><Phone /></button> : null}
                    {p.mobile ? <button type="button" className="wa" title="WhatsApp" aria-label="WhatsApp" onClick={() => window.open(waLink(p.mobile!), "_blank", "noopener")}><MessageCircle /></button> : null}
                    {p.workEmail ? <button type="button" title={p.workEmail} aria-label="Email" onClick={() => { window.location.href = `mailto:${p.workEmail}`; }}><Mail /></button> : null}
                  </div>
                </article>
              )) : <div className="es-empty es-span"><span className="icon-tile"><SearchX /></span><b>No one found</b><span>Try another name, code or department.</span></div>}
            </div>
          )}
        </div>

        <div className="es-col">
          <div className="es-card">
            <div className="es-head"><h3>Announcements</h3><span className="spacer" />{unread > 0 && <span className="badge info">{unread} new</span>}</div>
            {error ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !items ? <Skeleton style={{ height: 180 }} /> : items.length ? (
              <div className="es-dr-ann">
                {items.map((a) => {
                  const { Icon, tone } = kindIcon(a.kind), r = readOf(a.id);
                  return (
                    <button key={a.id} type="button" className="es-dr-ai" onClick={() => openAnn(a)}>
                      <span className={`icon-tile ${tone}`}><Icon /></span>
                      <div><b style={{ fontWeight: r ? 600 : 800 }}>{a.isPinned && <Pin style={{ width: 12, height: 12, marginRight: 4, verticalAlign: -1 }} aria-label="Pinned" />}{a.title}</b><small>{subline(a)}</small></div>
                      <em>{r?.rsvp ? RSVP.find((x) => x[0] === r.rsvp)?.[1] : ago(a.publishedAt)}</em>
                    </button>
                  );
                })}
              </div>
            ) : <div className="es-empty"><b>No announcements</b><span>Company news from HR appears here.</span></div>}
          </div>
        </div>
      </div>

      <Drawer open={!!person} onClose={() => setPerson(null)} title="Profile" subtitle={person ? [person.department, person.branch].filter(Boolean).join(" · ") : undefined} className="es-sheet-host">
        {person && (
          <>
            <div className="es-dr-dhead"><span className="avatar xl">{initialsOf(person.name)}</span><div><h3>{person.name}</h3><p>{person.designation ?? "—"}</p><span className={`es-dr-st ${dotOf(person.presence)}`}><i className={`es-dr-dot ${dotOf(person.presence)}`} />{statusLine(person.presence)}</span></div></div>
            <div className="es-dr-dacts">
              {person.mobile ? <a className="btn secondary" href={`tel:${person.mobile}`}><Phone />Call</a> : <button className="btn secondary" type="button" disabled><Phone />Call</button>}
              {person.mobile ? <a className="btn secondary" href={waLink(person.mobile)} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a> : <button className="btn secondary" type="button" disabled><MessageCircle />WhatsApp</button>}
              {person.workEmail ? <a className="btn primary" href={`mailto:${person.workEmail}`}><Mail />Email</a> : <button className="btn primary" type="button" disabled><Mail />Email</button>}
            </div>
            <div className="dl es-dr-dl">
              <div><span>Employee ID</span><b>{person.code}</b></div><div><span>Department</span><b>{person.department ?? "—"}</b></div>
              <div><span>Branch</span><b>{person.branch ?? "—"}</b></div><div><span>Mobile</span><b>{person.mobile ?? "—"}</b></div>
              <div><span>Email</span><b>{person.workEmail ?? "—"}</b></div>
              {person.presence?.untilAt && <div><span>Status until</span><b>{dateTime(person.presence.untilAt)}</b></div>}
            </div>
          </>
        )}
      </Drawer>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} subtitle={open ? subline(open) : undefined} className="es-sheet-host"
        foot={<><button type="button" className="btn secondary" onClick={() => setOpen(null)}>Close</button><button type="button" className="btn primary" onClick={() => setOpen(null)}><Check />Got it</button></>}>
        {open && (() => {
          const { Icon, tone } = kindIcon(open.kind), r = readOf(open.id);
          return (
            <div className="es-dr-annbody">
              <span className={`icon-tile ${tone}`}><Icon /></span>
              {open.summary && <p><b>{open.summary}</b></p>}
              {(open.body ?? "").split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i} style={{ whiteSpace: "pre-line" }}>{para}</p>)}
              {open.eventAt && <p className="small muted"><MapPin style={{ width: 13, height: 13, verticalAlign: -2 }} /> {[open.venue, dateTime(open.eventAt)].filter(Boolean).join(" · ")}</p>}
              {open.requiresRsvp && (
                <div className="seg" role="group" aria-label="RSVP" style={{ alignSelf: "flex-start" }}>
                  {RSVP.map(([c, l]) => <button key={c} type="button" className={r?.rsvp === c ? "active" : ""} onClick={() => markRead(open, c)}>{l}</button>)}
                </div>
              )}
              <p className="small muted">{[open.branch ?? "All branches", open.department ?? "all departments"].join(" · ")} · Published {dateTime(open.publishedAt)}{open.expiresAt ? ` · until ${dateTime(open.expiresAt)}` : ""}{r ? ` · Read ${dateTime(r.readAt)}` : ""}</p>
            </div>
          );
        })()}
      </Drawer>

      <StatusModal open={statusOpen} mine={dir?.mine ?? null} onClose={() => setStatusOpen(false)}
        onSaved={(p) => { setDir((d) => d && { ...d, mine: p, people: d.people.map((x) => (x.me ? { ...x, presence: p } : x)) }); setStatusOpen(false); toast("Status updated", { tone: "good" }); }} />
    </>
  );
}

/** The viewer's presence: status, an optional note and place, and when it ends. */
function StatusModal({ open, mine, onClose, onSaved }: { open: boolean; mine: Presence | null; onClose: () => void; onSaved: (p: Presence | null) => void }) {
  const [status, setStatus] = useState("AVAILABLE");
  const [message, setMessage] = useState("");
  const [place, setPlace] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setStatus(mine?.status ?? "AVAILABLE"); setMessage(mine?.message ?? ""); setPlace(mine?.locationLabel ?? ""); setUntil(""); setErr(null); }
  }
  const save = async () => {
    setBusy(true); setErr(null);
    try { onSaved(await setMyPresence({ status, message: message.trim() || null, locationLabel: place.trim() || null, untilAt: until ? new Date(until).toISOString() : null })); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not save your status"); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="My status" subtitle="Shown on your card in the directory"
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><Check />{busy ? "Saving…" : "Save status"}</button></>}>
      <div className="es-kd-form">
        <div className="es-field"><span>Status</span>
          <div className="chips">{Object.entries(DOT).map(([c, d]) => <button key={c} type="button" className={status === c ? "active" : ""} onClick={() => setStatus(c)}><i className={`es-dr-dot ${d.cls}`} style={{ marginRight: 6 }} />{d.label}</button>)}</div>
        </div>
        <label className="es-field"><span>Note</span><input value={message} maxLength={80} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. In a meeting until 11:30" /></label>
        <label className="es-field"><span>Where</span><input value={place} maxLength={80} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Client visit · Gulberg" /></label>
        <label className="es-field"><span>Clear after</span><input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
        {err && <p className="small" style={{ color: "var(--danger)", margin: 0 }}>{err}</p>}
      </div>
    </Modal>
  );
}
