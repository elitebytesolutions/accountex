"use client";

import { CornerDownRight, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import type { MyHelpdesk } from "@/shared/self-service/helpdesk";
import type { TicketDeskRouting, TicketDetail } from "@/shared/self-service/helpdesk-ticket";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { deskIcon } from "@/features/self-service/components/ess-ui";
import { raiseTicket } from "../api";

const hours = (h: number) => (Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`);

/** Mounted per opening (keyed by the parent), so the form starts empty each time. Template 11-helpdesk newTicket(): desk picker with routing hint, subject with matching quick answers, priority, contact, description. */
export function RaiseTicket({ open, desks, routing, faqs, initialDesk, onClose, onRaised }: {
  open: boolean;
  desks: MyHelpdesk["categories"];
  routing: TicketDeskRouting[];
  faqs: MyHelpdesk["faqs"];
  initialDesk: string | null;
  onClose: () => void;
  onRaised: (t: TicketDetail) => void;
}) {
  const toast = useToast();
  const [deskId, setDeskId] = useState(initialDesk ?? desks[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [channel, setChannel] = useState("WHATSAPP");
  const [contact, setContact] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const desk = desks.find((d) => d.id === deskId);
  const route = (id: string) => routing.find((r) => r.id === id);
  const sla = desk ? desk.slaHours * (priority === "HIGH" ? route(desk.id)?.highPrioritySlaFactor ?? 0.5 : 1) : null;
  /** Typing a desk's routing keyword picks that desk; matching quick answers show under the subject. */
  const onSubject = (v: string) => {
    setSubject(v);
    const q = v.toLowerCase();
    const hit = desks.find((d) => (route(d.id)?.routingKeywords ?? []).some((k) => q.includes(k)));
    if (hit && hit.id !== deskId) setDeskId(hit.id);
  };
  const suggestions = useMemo(() => {
    const words = subject.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    return words.length ? faqs.filter((f) => words.some((w) => f.question.toLowerCase().includes(w) || f.keywords.includes(w))).slice(0, 2) : [];
  }, [subject, faqs]);

  const submit = async () => {
    setBusy(true);
    try {
      const t = await raiseTicket({ categoryId: deskId, subject, description, priority, contactChannel: channel, contactValue: contact || null });
      toast(`${t.docNo} created · ${t.agent ? `${t.agent.name} will` : "the desk will"} respond within ${hours(t.slaHours)}`, { tone: "good" });
      onRaised(t);
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(e.details);
      toast(e instanceof ApiError ? e.message : "Could not raise the ticket", { tone: "danger" });
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New ticket" subtitle="We reply within the desk’s SLA. Follow the ticket live from My tickets."
      foot={<><button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="btn primary" onClick={submit} disabled={busy || !deskId}><Send />{busy ? "Submitting…" : "Submit ticket"}</button></>}>
      <div className="es-sheet-host">
        <div className="es-field">
          <span>Desk</span>
          <div className="es-opts" role="radiogroup" aria-label="Desk">
            {desks.map((d) => { const { Icon } = deskIcon(d.icon); return <button key={d.id} type="button" role="radio" aria-checked={d.id === deskId} className={`es-opt${d.id === deskId ? " on" : ""}`} onClick={() => setDeskId(d.id)}><Icon />{d.name}</button>; })}
          </div>
          {desk && sla !== null && <span className="es-hint" style={{ display: "flex", alignItems: "center", gap: 5 }}><CornerDownRight style={{ width: 13, height: 13 }} />Routed to the {desk.name} desk · reply within {hours(sla)}</span>}
          {errors.categoryId && <span className="field-error">{errors.categoryId[0]}</span>}
        </div>
        <div style={{ marginTop: 14 }}>
          <FormGrid>
            <Field label="Subject" required full error={errors.subject?.[0]}><Input value={subject} onChange={(e) => onSubject(e.target.value)} placeholder="e.g. Commission missing for Metro invoices" maxLength={140} /></Field>
            {suggestions.length > 0 && (
              <div className="es-hd-sugg full" style={{ gridColumn: "1 / -1" }}>
                <small><Sparkles />These answers might help</small>
                {suggestions.map((f) => <details key={f.id}><summary>{f.question}</summary><p>{f.answer}</p></details>)}
              </div>
            )}
            <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option></Select></Field>
            <Field label="Contact me on"><Select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option></Select></Field>
            <Field label={channel === "EMAIL" ? "Email (optional)" : "WhatsApp number (optional)"} full error={errors.contactValue?.[0]}><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder={channel === "EMAIL" ? "you@company.com" : "0300-1234567"} /></Field>
            <Field label="Describe the issue" required full error={errors.description?.[0]}><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, when, and what you expected." /></Field>
          </FormGrid>
        </div>
      </div>
    </Modal>
  );
}
