"use client";

import "../profile.css";
import {
  BadgeCheck, Briefcase, Building2, Cake, CalendarDays, ChevronRight, CircleUser, Clock, Clock3, Contact, CreditCard, Droplet, Eye, EyeOff, FileBadge, FileText, Hash,
  Heart, HeartPulse, House, IdCard, Inbox, Landmark, Layers, Lock, Mail, MapPin, MoonStar, Pencil, PencilLine, Percent, Phone, ReceiptText, ScanLine, Send, Siren,
  Smartphone, UserCheck, UserRound, Users, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MyProfile, MyProfileField, ProfileChangeRequest, ProfileFieldKey } from "@/shared/self-service/profile-change";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { Drawer } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";
import { Av, EsRing, EsTracker } from "@/features/hr/components/ess-bits";
import { myPersonalDetails, requestProfileChange, withdrawProfileChange } from "../api";

type TabId = "personal" | "job" | "bank" | "emergency";
/** A row of a details tab: a locked HR value, or a requestable field. */
type Row = { key: string; label: string; value: string | null; icon: LucideIcon; field?: MyProfileField };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dmy = (iso: string | null) => (iso ? `${iso.slice(8, 10)} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : null);
const maskVal = (v: string) => v.replace(/[0-9A-Z](?=[0-9A-Z ]{4})/gi, "•");
const title = (s: string | null) => (s ? s.toLowerCase().split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ") : null);
function tenure(iso: string | null) {
  if (!iso) return "";
  const a = new Date(`${iso}T00:00:00`), b = new Date();
  let m = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) m -= 1;
  const y = Math.floor(m / 12);
  return m <= 0 ? "" : ` · ${y ? `${y} yr${y > 1 ? "s" : ""} ` : ""}${m % 12} mo${m % 12 === 1 ? "" : "s"}`;
}
const STATUS: Record<string, [string, string]> = { PENDING: ["In review", "warn"], APPROVED: ["Updated", "good"], REJECTED: ["Rejected", "danger"], WITHDRAWN: ["Withdrawn", "neutral"] };
const FIELD_ICONS: Partial<Record<ProfileFieldKey, LucideIcon>> = {
  MARITAL_STATUS: Heart, BLOOD_GROUP: Droplet, PERSONAL_EMAIL: Mail, MOBILE: Smartphone, HOME_ADDRESS: House, SALARY_BANK: Landmark, ACCOUNT_NUMBER: CreditCard,
  IBAN: ScanLine, NTN_TAX_STATUS: ReceiptText, ZAKAT_EXEMPTION: MoonStar,
};
const PLACEHOLDER: Partial<Record<ProfileFieldKey, string>> = {
  PERSONAL_EMAIL: "name@example.com", MOBILE: "03001234567", IBAN: "PK36SCBL0000001123456702", NTN_TAX_STATUS: "1234567-8", ACCOUNT_NUMBER: "0123 4567 8901", HOME_ADDRESS: "House, street, area, city",
};

/** Template app/profile/details (6A-ess.html + 9C-ess.js): hero, tabbed details with "Change" → HR approval, pending changes, quick links. */
export function PersonalDetailsScreen({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<MyProfile | null>(null);
  const [error, setError] = useState<{ message: string; reference?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<TabId>("personal");
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<ProfileFieldKey | null | "any">(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => myPersonalDetails().then((d) => { setData(d); setError(null); }), []);
  useEffect(() => {
    let cancelled = false;
    myPersonalDetails()
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => !cancelled && setError(e instanceof ApiError ? { message: e.message, reference: e.correlationId } : { message: "Could not load your details" }));
    return () => { cancelled = true; };
  }, [attempt]);

  const f = useCallback((k: ProfileFieldKey) => data?.fields.find((x) => x.key === k), [data]);
  const tabs = useMemo(() => {
    if (!data) return null;
    const e = data.employee;
    const fr = (k: ProfileFieldKey): Row => { const x = f(k)!; return { key: k, label: x.label, value: x.value, icon: FIELD_ICONS[k] ?? Pencil, field: x }; };
    const personal: Row[] = [
      { key: "name", label: "Full name", value: e.name, icon: UserRound }, { key: "father", label: "Father’s / guardian’s name", value: e.guardianName, icon: Users },
      { key: "dob", label: "Date of birth", value: dmy(e.dateOfBirth), icon: Cake }, { key: "gender", label: "Gender", value: title(e.gender), icon: CircleUser },
      fr("MARITAL_STATUS"), { key: "cnic", label: "CNIC", value: e.cnic, icon: IdCard }, fr("BLOOD_GROUP"), fr("PERSONAL_EMAIL"), fr("MOBILE"), fr("HOME_ADDRESS"),
    ];
    const job: Row[] = [
      { key: "empid", label: "Employee ID", value: e.code, icon: Hash }, { key: "role", label: "Designation", value: e.designation, icon: Briefcase },
      { key: "dept", label: "Department", value: e.department, icon: Building2 }, { key: "grade", label: "Grade", value: e.grade, icon: Layers },
      { key: "manager", label: "Reports to", value: e.manager, icon: UserCheck }, { key: "branch", label: "Work location", value: e.branch, icon: MapPin },
      { key: "joined", label: "Date of joining", value: e.joiningDate ? `${dmy(e.joiningDate)}${tenure(e.joiningDate)}` : null, icon: CalendarDays },
      { key: "type", label: "Employment type", value: title(e.employmentType), icon: BadgeCheck }, { key: "shift", label: "Shift", value: e.shift, icon: Clock },
      { key: "wemail", label: "Work email", value: e.workEmail, icon: Mail },
    ];
    const bank: Row[] = [fr("SALARY_BANK"), fr("ACCOUNT_NUMBER"), fr("IBAN"), fr("NTN_TAX_STATUS"), fr("ZAKAT_EXEMPTION")];
    return { personal, job, bank };
  }, [data, f]);

  if (error) return <ErrorState message={error.message} reference={error.reference} onRetry={() => { setError(null); setAttempt((n) => n + 1); }} />;
  if (!data || !tabs) {
    return <div className="es-grid es-main"><Skeleton style={{ height: 220, gridColumn: "1 / -1" }} /><Skeleton style={{ height: 420 }} /><Skeleton style={{ height: 420 }} /></div>;
  }

  const e = data.employee;
  const pending = data.fields.filter((x) => x.pending);
  const editable = data.fields.filter((x) => x.key !== "PHOTO" && !x.pending);
  const filled = [e.cnic, e.dateOfBirth, e.guardianName, ...data.fields.filter((x) => !["PHOTO", "ACCOUNT_NUMBER", "ZAKAT_EXEMPTION"].includes(x.key)).map((x) => x.raw)];
  const complete = Math.round((filled.filter(Boolean).length / filled.length) * 100);
  const missing = data.fields.find((x) => !x.raw && !x.pending && !["PHOTO", "ACCOUNT_NUMBER", "ZAKAT_EXEMPTION"].includes(x.key));
  const decided = data.requests.filter((r) => r.status !== "PENDING").slice(0, 4);

  const withdraw = async (x: MyProfileField) => {
    if (!x.pending) return;
    setBusy(x.key);
    try {
      await withdrawProfileChange(x.pending.id, x.pending.rowVersion);
      await load();
      toast("Change request withdrawn", { tone: "info" });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Could not withdraw the request", { tone: "danger" });
    } finally { setBusy(null); }
  };

  const fieldRow = (r: Row) => {
    const x = r.field;
    const masked = !!x?.masked && !!r.value;
    const val = r.value ? (masked && !shown[r.key] ? maskVal(r.value) : r.value) : "—";
    return (
      <div key={r.key} className={`es-pf-field${x?.pending ? " has-pending" : ""}`} data-key={r.key}>
        <span className="es-pf-fic"><r.icon /></span>
        <div className="es-pf-fv">
          <span>{r.label}</span>
          <b>
            {masked ? <><span className="es-pf-mask">{val}</span><button type="button" className="es-pf-eye" aria-label={shown[r.key] ? "Hide" : "Show"} onClick={() => setShown((s) => ({ ...s, [r.key]: !s[r.key] }))}>{shown[r.key] ? <EyeOff /> : <Eye />}</button></> : val}
          </b>
          {x?.pending && <em className="es-pf-pend"><Clock3 />Pending change → {x.pending.requestedValue}</em>}
        </div>
        {x && canEdit ? (
          x.pending
            ? <button type="button" className="btn ghost sm" disabled={busy === r.key} onClick={() => withdraw(x)}>Withdraw</button>
            : <button type="button" className="btn ghost sm es-pf-edit" onClick={() => setSheet(x.key)}><Pencil /><span>Change</span></button>
        ) : (
          <span className="es-pf-lock" title="Managed by HR"><Lock /></span>
        )}
      </div>
    );
  };

  const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
    { id: "personal", label: "Personal", Icon: UserRound }, { id: "job", label: "Job", Icon: Briefcase }, { id: "bank", label: "Bank & Payroll", Icon: Landmark }, { id: "emergency", label: "Emergency", Icon: Siren },
  ];

  return (
    <>
      <PageHead
        eyebrow="My Profile / Personal Details"
        title="My Profile"
        description="Your personal, job and payroll details. Changes go to HR for approval before they take effect."
        actions={<>
          <Link className="btn secondary" href="/profile/requests"><FileBadge />Request a letter</Link>
          {canEdit && <button className="btn primary" type="button" disabled={!editable.length} onClick={() => setSheet("any")}><PencilLine />Request change</button>}
        </>}
      />

      <div className="es-card es-pf-hero">
        <div className="es-pf-cover" aria-hidden />
        <div className="es-pf-id">
          <div className="es-pf-avwrap"><Av name={e.name} size="xl" /></div>
          <div className="es-pf-who">
            <h2>{e.name}</h2>
            <p>{[e.designation, e.department, e.branch].filter(Boolean).join(" · ") || "—"}</p>
            <div className="es-row wrap">
              <span className={`badge dot ${e.status === "EXITED" ? "neutral" : e.status === "NOTICE_PERIOD" ? "warn" : "good"}`}>{title(e.status)}</span>
              <span className="pill"><Hash />{e.code}</span>
              {e.joiningDate && <span className="pill"><CalendarDays />Joined <b>{dmy(e.joiningDate)}</b></span>}
              {e.manager && <span className="pill"><UserCheck />Reports to <b>{e.manager}</b></span>}
            </div>
          </div>
          <div className="es-pf-comp">
            <EsRing pct={complete} size={84} label={`${complete}%`} sub="complete" />
            <div>
              <b>{complete >= 100 ? "All set" : "Almost there"}</b>
              <small>{missing ? `Add your ${missing.label.toLowerCase()} to complete your profile.` : "Your profile details are complete."}</small>
              {missing && canEdit && <button type="button" className="es-link" onClick={() => setSheet(missing.key)}>Fix now<ChevronRight /></button>}
            </div>
          </div>
        </div>
      </div>

      <div className="es-grid es-main">
        <div className="es-card es-pf-main">
          <div className="tabs" role="tablist">
            {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}><t.Icon />{t.label}</button>)}
          </div>
          {tab === "emergency" ? (
            <>
              {e.emergencyContactName ? (
                <div className="es-pf-contacts">
                  <div className="es-pf-contact es-in">
                    <Av name={e.emergencyContactName} size="lg" />
                    <div><b>{e.emergencyContactName}</b><small>{title(e.emergencyRelation) ?? "Emergency contact"} · primary</small>{e.emergencyPhone && <span className="es-pf-ph"><Phone />{e.emergencyPhone}</span>}</div>
                    <div className="es-pf-cacts">{e.emergencyPhone && <a className="icon-btn-sm" href={`tel:${e.emergencyPhone}`} title="Call" aria-label="Call"><Phone /></a>}</div>
                  </div>
                </div>
              ) : (
                <div className="es-empty es-pf-none"><span className="icon-tile"><Inbox /></span><b>No emergency contact</b><span>Ask HR to add one to your record.</span></div>
              )}
              {(() => { const bg = f("BLOOD_GROUP")?.value; return (
                <div className="es-pf-medical"><span className="icon-tile red"><HeartPulse /></span><div><b>Medical notes for first responders</b><small>{bg ? `Blood group ${bg}` : "Blood group not recorded"} · Emergency contacts are kept by HR</small></div></div>
              ); })()}
            </>
          ) : (
            <div className="es-pf-fields">{tabs[tab].map(fieldRow)}</div>
          )}
        </div>

        <div className="es-col">
          <div className="es-card">
            <div className="es-head"><h3>Pending changes</h3><span className="es-count">{pending.length}</span></div>
            {pending.length ? pending.map((x, i) => (
              <div key={x.key} className="es-pf-pitem es-in" style={{ ["--i" as string]: i }}>
                <div className="es-row"><b>{x.label}</b><span className="spacer" /><span className="badge warn dot">In review</span></div>
                <small>{x.masked ? maskVal(x.value ?? "—") : x.value ?? "—"} → <b>{x.pending!.requestedValue}</b></small>
                <EsTracker small steps={["Submitted", "HR review", "Updated"]} at={1} subs={[dmy(x.pending!.createdAt.slice(0, 10)), "HR", null]} />
              </div>
            )) : (
              <div className="es-empty es-pf-none"><span className="icon-tile"><Inbox /></span><b>No pending changes</b><span>Use “Change” next to any editable field.</span></div>
            )}
          </div>

          {decided.length > 0 && (
            <div className="es-card">
              <div className="es-head"><h3>Recent decisions</h3></div>
              {decided.map((r: ProfileChangeRequest) => (
                <div key={r.id} className="es-pf-pitem">
                  <div className="es-row"><b>{r.fieldLabel}</b><span className="spacer" /><span className={`badge dot ${STATUS[r.status]?.[1] ?? "neutral"}`}>{STATUS[r.status]?.[0] ?? r.status}</span></div>
                  <small>→ <b>{r.requestedValue}</b>{r.reviewComment ? ` · ${r.reviewComment}` : ""}</small>
                </div>
              ))}
            </div>
          )}

          <div className="es-card">
            <div className="es-head"><h3>Quick links</h3></div>
            <div className="es-pf-links">
              {([["/profile/payslips", FileText, "Payslips & tax certificate"], ["/profile/requests", FileBadge, "Salary certificate & NOCs"], ["/profile/tax", Percent, "Tax declarations"], ["/profile/directory", Contact, "Company directory"]] as const).map(([href, Ic, label]) => (
                <Link key={href} href={href}><Ic /><span>{label}</span><ChevronRight /></Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {sheet && (
        <ChangeSheet
          fields={editable}
          initial={sheet === "any" ? editable[0]?.key ?? null : sheet}
          choices={data.choices}
          onClose={() => setSheet(null)}
          onSaved={async (label) => {
            setSheet(null);
            await load();
            toast(`${label} change sent to HR`, { tone: "good" });
          }}
        />
      )}
    </>
  );
}

/** The template's "Request a change" sheet: field, current value, new value (a list for coded fields), reason. */
function ChangeSheet({ fields, initial, choices, onClose, onSaved }: {
  fields: MyProfileField[]; initial: ProfileFieldKey | null; choices: MyProfile["choices"]; onClose: () => void; onSaved: (label: string) => void;
}) {
  const [key, setKey] = useState<ProfileFieldKey | null>(initial);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = fields.find((x) => x.key === key) ?? null;
  const opts = key ? choices[key] : undefined;

  const submit = async () => {
    if (!field) return;
    if (!value.trim()) { setErr("Enter the new value"); return; }
    setSaving(true); setErr(null);
    try {
      await requestProfileChange({ fieldKey: field.key, requestedValue: value, reason: reason.trim() || null });
      onSaved(field.label);
    } catch (e) {
      setErr(e instanceof ApiError ? e.details?.requestedValue?.[0] ?? e.message : "Could not send the request");
    } finally { setSaving(false); }
  };

  return (
    <Drawer open onClose={onClose} title="Request a change" subtitle="HR reviews changes within 2 working days. Bank changes apply from the next payroll." className="es-sheet-host"
      foot={<><button className="btn secondary" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" disabled={saving || !field} onClick={submit}><Send />{saving ? "Submitting…" : "Submit for approval"}</button></>}>
      {!fields.length ? (
        <div className="es-empty"><span className="icon-tile"><Inbox /></span><b>Nothing to change</b><span>Every editable field already has a pending request.</span></div>
      ) : (
        <FormGrid cols={1}>
          <Field label="Field" full>
            <Select value={key ?? ""} onChange={(ev) => { setKey(ev.target.value as ProfileFieldKey); setValue(""); setErr(null); }}>
              {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </Select>
          </Field>
          <Field label="Current value" full><Input value={field?.masked && field.value ? maskVal(field.value) : field?.value ?? "—"} disabled /></Field>
          <Field label="New value" required full error={err ?? undefined}>
            {opts ? (
              <Select value={value} onChange={(ev) => setValue(ev.target.value)}>
                <option value="">Choose…</option>
                {opts.filter((o) => o.code !== field?.raw).map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </Select>
            ) : key === "HOME_ADDRESS" ? (
              <Textarea rows={2} value={value} placeholder={PLACEHOLDER[key]} onChange={(ev) => setValue(ev.target.value)} />
            ) : (
              <Input value={value} placeholder={key ? PLACEHOLDER[key] ?? "Enter the corrected value" : ""} onChange={(ev) => setValue(ev.target.value)} autoFocus />
            )}
          </Field>
          <Field label="Reason" full><Textarea rows={2} value={reason} placeholder="e.g. Moved house in September" onChange={(ev) => setReason(ev.target.value)} /></Field>
        </FormGrid>
      )}
    </Drawer>
  );
}
