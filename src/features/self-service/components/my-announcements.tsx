"use client";

import { Check, LayoutGrid, MapPin, Network, Pin, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { MyAnnouncement } from "@/shared/self-service/announcement";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { ApiError } from "@/lib/api/errors";
import { myAnnouncements } from "../api";
import { ago, dateTime, kindIcon } from "./ess-ui";

/** The second line of an announcement in the card: author · venue / summary (template ANN[3]). */
const subline = (a: MyAnnouncement) => [a.authorLabel, a.eventAt ? [a.venue, dateTime(a.eventAt)].filter(Boolean).join(" · ") : a.summary].filter(Boolean).join(" · ");

/**
 * Template app/profile/directory (9C-ess.js 08-company): the Announcements side card and its reader drawer. The people
 * grid, org chart and presence arrive with employees (Phase 11) and presence (Phase 34).
 */
export function MyAnnouncements() {
  const [items, setItems] = useState<MyAnnouncement[] | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<MyAnnouncement | null>(null);
  const [fresh, setFresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    myAnnouncements()
      .then((d) => {
        if (cancelled) return;
        setItems(d);
        setFresh(d.filter((a) => a.publishedAt && Date.now() - new Date(a.publishedAt).getTime() < 7 * 864e5).length);
        setError(null);
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load announcements" }));
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <>
      <PageHead eyebrow="My Profile / Directory" title="People Directory" description="Find colleagues across branches, and keep up with company news."
        actions={<div className="seg" role="tablist" aria-label="View">
          <button type="button" className="active" disabled title="The people directory arrives with employees (Phase 11)"><LayoutGrid />People</button>
          <button type="button" disabled title="The org chart arrives with employees (Phase 11)"><Network />Org chart</button>
        </div>} />

      <div className="es-grid es-main">
        <div className="es-col">
          <div className="es-card">
            <div className="es-empty"><span className="icon-tile"><Users /></span><b>The people directory is on its way</b><span>Colleagues, their roles and how to reach them appear here once employee records (Phase 11) and presence (Phase 34) are live.</span></div>
          </div>
        </div>
        <div className="es-col">
          <div className="es-card">
            <div className="es-head"><h3>Announcements</h3><span className="spacer" />{fresh > 0 && <span className="badge info">{fresh} new</span>}</div>
            {error ? <ErrorState message={error.message} reference={error.reference} onRetry={() => setAttempt((n) => n + 1)} /> : !items ? <Skeleton style={{ height: 180 }} /> : items.length ? (
              <div className="es-dr-ann">
                {items.map((a) => {
                  const { Icon, tone } = kindIcon(a.kind);
                  return (
                    <button key={a.id} type="button" className="es-dr-ai" onClick={() => setOpen(a)}>
                      <span className={`icon-tile ${tone}`}><Icon /></span>
                      <div><b>{a.isPinned && <Pin style={{ width: 12, height: 12, marginRight: 4, verticalAlign: -1 }} aria-label="Pinned" />}{a.title}</b><small>{subline(a)}</small></div>
                      <em>{ago(a.publishedAt)}</em>
                    </button>
                  );
                })}
              </div>
            ) : <div className="es-empty"><b>No announcements</b><span>Company news from HR appears here.</span></div>}
          </div>
        </div>
      </div>

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""} subtitle={open ? subline(open) : undefined} className="es-sheet-host"
        foot={<><button type="button" className="btn secondary" onClick={() => setOpen(null)}>Close</button><button type="button" className="btn primary" onClick={() => setOpen(null)}><Check />Got it</button></>}>
        {open && (() => {
          const { Icon, tone } = kindIcon(open.kind);
          return (
            <div className="es-dr-annbody">
              <span className={`icon-tile ${tone}`}><Icon /></span>
              {open.summary && <p><b>{open.summary}</b></p>}
              {(open.body ?? "").split(/\n{2,}/).filter(Boolean).map((para, i) => <p key={i} style={{ whiteSpace: "pre-line" }}>{para}</p>)}
              {open.eventAt && <p className="small muted"><MapPin style={{ width: 13, height: 13, verticalAlign: -2 }} /> {[open.venue, dateTime(open.eventAt)].filter(Boolean).join(" · ")}{open.requiresRsvp ? " · RSVP opens in Phase 34" : ""}</p>}
              <p className="small muted">{[open.branch ?? "All branches", open.department ?? "all departments"].join(" · ")} · Published {dateTime(open.publishedAt)}{open.expiresAt ? ` · until ${dateTime(open.expiresAt)}` : ""}</p>
            </div>
          );
        })()}
      </Drawer>
    </>
  );
}
