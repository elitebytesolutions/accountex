"use client";

import { Check, Flag, PenLine, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { MyPolicies, MyPolicy } from "@/shared/self-service/policy-ack";
import { Field } from "@/components/ui/form";
import { Modal } from "@/components/ui/overlay";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { dmy } from "@/features/hr/components/attendance-ui";
import { apiFieldErrors, apiMessage } from "@/features/treasury/components/treasury-ui";
import { ApiError } from "@/lib/api/errors";
import { acknowledgePolicy, myPolicies } from "../api";

/** Policy text: blank-line separated sections; a short first line of a section is its heading (template es-ob-doc h4 + p). */
function sections(body: string | null) {
  return (body ?? "").split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).map((s) => {
    const [first, ...rest] = s.split("\n");
    return rest.length && first!.length <= 80 && !/[.:;,]$/.test(first!) ? { h: first!, p: rest.join("\n") } : { h: null, p: s };
  });
}

/**
 * My Profile › Onboarding & Policies: the company policies card (template 9C-ess.js "Policies" group + policySheet).
 * Each published policy opens the reader: a read-progress bar, the "I have read" box enabled at the end, a typed-name
 * signature and "I agree", which records the acknowledgement of that version.
 */
export function MyPoliciesCard({ can }: { can: { edit: boolean } }) {
  const toast = useToast();
  const [data, setData] = useState<MyPolicies | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<MyPolicy | null>(null);
  const [just, setJust] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    myPolicies().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load the company policies" }));
    return () => { cancelled = true; };
  }, [attempt]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  if (error) return <div className="mt"><ErrorState message={error.message} reference={error.reference} onRetry={reload} /></div>;
  if (!data) return <Skeleton style={{ height: 180, marginTop: 16 }} />;
  const { required, acknowledged } = data.summary;
  const complete = required > 0 && acknowledged === required;

  return (
    <div className="es-grid es-wide mt">
      <div className={`es-card es-ob-group${complete ? " complete" : ""}`}>
        <div className="es-head">
          <span className={`icon-tile${complete ? " lime" : ""}`}><ShieldCheck /></span>
          <div><h3>Company policies</h3><p className="es-label">{required ? `${acknowledged} of ${required} acknowledged` : "Policies HR publishes appear here"}</p></div>
          <span className="spacer" /><span className="es-count">{acknowledged}/{required}</span>
        </div>
        {!data.policies.length ? (
          <div className="es-empty"><span className="icon-tile"><ShieldCheck /></span><b>No published policies</b>
            <span>{data.employeeName ? "When HR publishes a policy, read and acknowledge it here." : "Your user isn’t linked to an employee record yet. Ask HR to link it."}</span></div>
        ) : (
          <ul className="es-ob-list">{data.policies.map((p, i) => {
            const done = !!p.acknowledgedAt;
            return (
              <li key={p.id} className={`es-ob-item es-in${done ? " done" : ""}${just === p.id ? " es-ob-just" : ""}`} style={{ ["--i" as string]: i } as CSSProperties}>
                <span className="es-ob-ck"><Check /></span>
                <div className="es-ob-txt"><b>{p.title}</b>
                  <small>{done ? `Acknowledged ${dmy(p.acknowledgedAt!.slice(0, 10))} · v${p.version}`
                    : `${p.code} · v${p.version}${p.previousVersionAcknowledged ? " · revised since you signed" : ""}${p.readMinutes ? ` · ${p.readMinutes} min read` : ""}${p.requiresAcknowledgement ? "" : " · for information"}`}</small></div>
                {done ? <><span className="es-ob-ok">Done</span><button className="btn ghost sm" type="button" onClick={() => setOpen(p)}>Read</button></>
                  : <>{p.requiresAcknowledgement && <span className="pill es-ob-due">To read</span>}
                    <button className={`btn ${p.requiresAcknowledgement ? "primary" : "secondary"} sm`} type="button" onClick={() => setOpen(p)}>{p.requiresAcknowledgement ? "Read & agree" : "Read"}</button></>}
              </li>
            );
          })}</ul>
        )}
      </div>
      {open && <PolicyReader policy={open} name={data.employeeName ?? ""} canSign={can.edit && !!data.employeeName} onClose={() => setOpen(null)}
        onSigned={(id) => { setOpen(null); setJust(id); reload(); toast("Policy acknowledged · e-signature recorded", { tone: "good" }); }}
        onError={(e) => toast(apiMessage(e, "Could not record the acknowledgement"), { tone: "danger" })} />}
    </div>
  );
}

function PolicyReader({ policy: p, name, canSign, onClose, onSigned, onError }: {
  policy: MyPolicy; name: string; canSign: boolean; onClose: () => void; onSigned: (id: string) => void; onError: (e: unknown) => void;
}) {
  const doc = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [agree, setAgree] = useState(false);
  const [sig, setSig] = useState(name);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const read = progress > 0.96;
  const signable = canSign && p.requiresAcknowledgement && !p.acknowledgedAt;

  const onScroll = useCallback(() => {
    const d = doc.current;
    if (!d) return;
    setProgress((x) => Math.max(x, Math.min(1, d.scrollTop / Math.max(1, d.scrollHeight - d.clientHeight))));
  }, []);
  useEffect(() => { const t = setTimeout(onScroll, 100); return () => clearTimeout(t); }, [onScroll]);

  const sign = async () => {
    setBusy(true);
    setErrs({});
    try { await acknowledgePolicy(p.id, { readToEnd: read, signatureText: sig }); onSigned(p.id); }
    catch (e) { setErrs(apiFieldErrors(e)); onError(e); } finally { setBusy(false); }
  };

  return (
    <Modal open wide onClose={onClose} title={p.title} subtitle={`${p.code} · v${p.version} · effective ${dmy(p.effectiveDate)}${p.owner ? ` · owner ${p.owner}` : ""}`}
      foot={signable ? <>
        <button className="btn secondary" type="button" onClick={onClose} disabled={busy}>Later</button>
        <button className="btn primary" type="button" disabled={!agree || busy || sig.trim().length < 3} onClick={sign}><PenLine />{busy ? "Signing…" : "I agree"}</button>
      </> : <button className="btn secondary" type="button" onClick={onClose}>Close</button>}>
      <div className="es-ob-read"><i style={{ width: `${progress * 100}%` }} /></div>
      <div className="es-ob-doc" ref={doc} tabIndex={0} onScroll={onScroll}>
        {sections(p.body).map((s, i) => <div key={i}>{s.h && <h4>{s.h}</h4>}<p style={{ whiteSpace: "pre-line", marginTop: s.h ? 0 : 12 }}>{s.p}</p></div>)}
        {!p.body && <p style={{ marginTop: 12 }}>This policy has no text yet.</p>}
        <p className="es-ob-end"><Flag />End of policy</p>
      </div>
      {p.acknowledgedAt ? (
        <div className="banner info mt"><ShieldCheck /><div><b>Acknowledged {dmy(p.acknowledgedAt.slice(0, 10))}</b><p>You signed version {p.version} of this policy.</p></div></div>
      ) : signable ? (
        <>
          <label className={`es-ob-agree${read ? " ready" : ""}`}>
            <input type="checkbox" disabled={!read} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I have read and agree to the {p.title}.</span>
          </label>
          <small className="es-hint">{read ? "Thanks for reading. Tick the box and sign with your full name." : "Scroll to the end to enable the checkbox."}</small>
          <div className="mt"><Field label="Signature (type your full name)" required error={errs.signatureText}>
            <input value={sig} maxLength={120} disabled={!read} onChange={(e) => setSig(e.target.value)} style={{ fontFamily: "var(--font-hand)", fontSize: 20 }} />
          </Field></div>
        </>
      ) : !p.requiresAcknowledgement ? <p className="es-hint mt">For information: no acknowledgement needed.</p> : null}
    </Modal>
  );
}
