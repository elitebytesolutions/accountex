"use client";

import {
  ArrowUpRight, Building, Check, ClipboardCopy, EllipsisVertical, Factory, Flag, FlagOff, FlaskConical, Gem, HeartHandshake, History, ListFilter, MapPin,
  Pencil, PencilLine, Plus, ReceiptText, Rocket, Sparkles, Store, Trash2, Truck, UserMinus, UserPlus, UsersRound, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NUMERIC_SEGMENT_ATTRIBUTES, SEGMENT_TONES, segmentKeyFor, segmentRuleErrors,
  type Segment, type SegmentAttribute, type SegmentEvaluation, type SegmentOperator, type SegmentOptions, type SegmentOverride, type SegmentRule,
} from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu, type MenuItem } from "@/components/ui/menu";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { PageHead } from "@/components/ui/page";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { adminErrorMessage, adminFieldErrors } from "@/features/admin-common/errors";
import { AdminHistoryTab } from "@/features/admin-history/components/admin-history-tab";
import { createSegment, deleteSegment, getSegmentOptions, listSegments, previewSegment, saveSegmentOverrides, saveSegmentRules, updateSegment } from "../api";
import { copyText, initials, useLoad } from "./config-ui";

/** Template SEG_ATTRS labels and kinds (9J-flags.js ATTRS). */
const ATTRS: Record<SegmentAttribute, { label: string; icon: LucideIcon }> = {
  PLAN: { label: "Plan", icon: Gem }, REGION: { label: "Region", icon: MapPin }, CITY: { label: "City", icon: MapPin },
  INDUSTRY: { label: "Industry", icon: Factory }, AGE_DAYS: { label: "Tenant age (days)", icon: Sparkles },
  SALES_TAX_REGISTERED: { label: "Sales-tax registered", icon: ReceiptText }, BETA: { label: "Beta opt-in", icon: FlaskConical },
  INTERNAL: { label: "Internal tenant", icon: Building }, APP_VERSION: { label: "App version", icon: Rocket }, PLATFORM: { label: "Platform", icon: Store },
};
const ATTR_ORDER: SegmentAttribute[] = ["PLAN", "REGION", "CITY", "INDUSTRY", "AGE_DAYS", "SALES_TAX_REGISTERED", "BETA", "INTERNAL", "APP_VERSION", "PLATFORM"];
const OPS: Record<SegmentOperator, string> = { IN: "is one of", NOT_IN: "is not one of", GT: "greater than", LT: "less than" };
const opsFor = (a: SegmentAttribute): SegmentOperator[] => (NUMERIC_SEGMENT_ATTRIBUTES.includes(a) ? ["GT", "LT", "IN"] : ["IN", "NOT_IN"]);
const ICONS: Record<string, LucideIcon> = {
  "users-round": UsersRound, "flask-conical": FlaskConical, building: Building, gem: Gem, "map-pin": MapPin, "receipt-text": ReceiptText,
  sparkles: Sparkles, truck: Truck, store: Store, factory: Factory, rocket: Rocket, "heart-handshake": HeartHandshake,
};
const SegIcon = ({ name }: { name: string | null }) => { const I = (name && ICONS[name]) || UsersRound; return <I />; };
const tone = (t: string) => t.toLowerCase();
type SegmentTone = (typeof SEGMENT_TONES)[number];
const PLAN_TONE: Record<string, string> = { STARTER: "starter", GROWTH: "growth", BUSINESS: "business", ENTERPRISE: "enterprise" };
const planCls = (code: string | null) => (code ? (PLAN_TONE[code.replace(/_V\d+$/, "")] ?? "") : "");

/** The values a rule can pick for an attribute (codes and labels), from the live platform data. */
function valueOptions(a: SegmentAttribute, o: SegmentOptions | null): { code: string; label: string }[] {
  if (!o) return [];
  switch (a) {
    case "PLAN": return o.plans.map((p) => ({ code: p.code, label: p.name }));
    case "REGION": return o.regions;
    case "INDUSTRY": return o.industries;
    case "CITY": return o.cities.map((c) => ({ code: c, label: c }));
    case "PLATFORM": return o.platforms;
    case "SALES_TAX_REGISTERED": case "BETA": case "INTERNAL": return [{ code: "true", label: "Yes" }, { code: "false", label: "No" }];
    default: return [];
  }
}
const sameRules = (a: SegmentRule[], b: SegmentRule[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Super Admin › Feature Management › Segments (template admin/segments, 3B-flags.html:25 + 9J-flags.js 1370–1500): segment
 * cards, the rule builder (mountRules), the match ring with plan breakdown, matching tenants and flags using the segment.
 * Template-style addition: include / exclude overrides (Platform.SegmentTenants). Counts come from the server matcher.
 */
export function SegmentsScreen() {
  const toast = useToast();
  const { data: segments, error, reload } = useLoad(listSegments, "Could not load segments");
  const { data: options } = useLoad(getSegmentOptions, "Could not load rule values");
  const [selId, setSelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SegmentRule[]>([]);
  const [shown, setShown] = useState("");
  const [evalr, setEvalr] = useState<SegmentEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"new" | "edit" | null>(null);
  const [menuAt, setMenuAt] = useState<HTMLElement | null>(null);
  const [removing, setRemoving] = useState(false);
  const [history, setHistory] = useState(false);
  const [pendingSel, setPendingSel] = useState<string | null>(null);

  const seg = segments?.find((s) => s.id === selId) ?? segments?.[0] ?? null;
  const key = seg ? `${seg.id}:${seg.rowVersion}` : "";
  if (key !== shown) {
    setShown(key);
    setDraft(seg ? seg.rules : []);
  }
  const dirty = !!seg && !sameRules(draft, seg.rules);
  const ruleProblems = draft.map((r) => segmentRuleErrors(r));
  const valid = draft.every((r, i) => r.values.length > 0 && Object.keys(ruleProblems[i]!).length === 0);

  // Live evaluation of the draft rules (debounced), like the template's segLive.
  useEffect(() => {
    if (!seg) return;
    let cancelled = false;
    const t = setTimeout(() => {
      const rules = draft.filter((r, i) => r.values.length > 0 && Object.keys(ruleProblems[i]!).length === 0);
      previewSegment(rules, seg.overrides.map(({ tenantId, membership }) => ({ tenantId, membership })))
        .then((e) => !cancelled && setEvalr(e))
        .catch(() => undefined);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(draft), seg?.id, seg?.rowVersion]);

  const choose = (id: string) => {
    if (id === seg?.id) return;
    if (dirty) { setPendingSel(id); return; }
    setSelId(id);
  };

  const saveRules = async () => {
    if (!seg) return;
    setBusy(true);
    try {
      const s = await saveSegmentRules(seg.id, draft, seg.rowVersion);
      toast(`“${s.name}” saved · ${s.memberCount} tenants`, { tone: "good" });
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not save the rules"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const saveOverrides = async (overrides: SegmentOverride[], msg: string) => {
    if (!seg) return;
    setBusy(true);
    try {
      await saveSegmentOverrides(seg.id, overrides, seg.rowVersion);
      toast(msg, { tone: "good" });
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not save the override"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!seg) return;
    setBusy(true);
    try {
      await deleteSegment(seg.id, seg.rowVersion);
      toast("Segment deleted", { tone: "warn" });
      setRemoving(false);
      setSelId(null);
      reload();
    } catch (e) {
      toast(adminErrorMessage(e, "Could not delete the segment"), { tone: "danger" });
      setRemoving(false);
    } finally {
      setBusy(false);
    }
  };

  const total = evalr?.total ?? options?.tenants.length ?? 0;
  const n = evalr?.count ?? seg?.memberCount ?? 0;
  const menu: MenuItem[] = seg ? [
    { label: "Copy key", icon: <ClipboardCopy />, onClick: async () => toast((await copyText(seg.key)) ? `${seg.key} copied` : "Could not copy", { tone: "info" }) },
    { label: "History", icon: <History />, onClick: () => setHistory(true) },
    { sep: true },
    { label: "Delete", icon: <Trash2 />, danger: true, onClick: () => {
      if (seg.flagsUsing.length || seg.broadcastsUsing) { toast(`Used by ${seg.flagsUsing.length + seg.broadcastsUsing} flags or broadcasts. Remove it from them first.`, { tone: "warn" }); return; }
      setRemoving(true);
    } },
  ] : [];

  return (
    <>
      <PageHead eyebrow={<><Link className="link" href="/admin/features">Feature Management</Link> / Segments</>} title="Segments"
        description="Reusable groups of tenants. Define them once and target them from any flag, so a change to a segment updates every flag that uses it."
        actions={<>
          <Link className="btn secondary" href="/admin/features"><Flag />Flags</Link>
          <button type="button" className="btn primary" onClick={() => setModal("new")}><Plus />New segment</button>
        </>} />

      {error && <ErrorState message={error.message} reference={error.reference} onRetry={reload} />}
      {!segments ? <div className="panel"><Skeleton style={{ height: 240 }} /></div> : segments.length === 0 ? (
        <div className="panel"><EmptyState icon={<UsersRound />} title="No segments yet" description="Create a segment such as “Beta tenants” or “Lahore pilot”, then target it from feature flags."
          action={<button type="button" className="btn primary" onClick={() => setModal("new")}><Plus />New segment</button>} /></div>
      ) : seg && (
        <>
          <div className="ff-segwrap">
            <div className="ff-seglist">
              <div className="ff-seglist-h"><b>{segments.length} segments</b><small>{total} tenants in total</small></div>
              {segments.map((s, i) => {
                const count = s.id === seg.id && evalr ? evalr.count : s.memberCount;
                return (
                  <button key={s.id} type="button" className={cn("ff-segcard", s.id === seg.id && "on")} style={{ ["--i" as string]: i }} onClick={() => choose(s.id)}>
                    <span className={`icon-tile ${tone(s.tone)}`}><SegIcon name={s.icon} /></span>
                    <div><b>{s.name}</b><small>{s.description ?? "Custom segment"}</small>
                      <div className="ff-segmeta"><span className="ff-mbar sm"><i style={{ ["--w" as string]: `${total ? (count / total) * 100 : 0}%` }} /></span><em>{count}</em>
                        <span className="ff-segused"><Flag />{s.flagsUsing.length}</span></div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="ff-segedit">
              <div className="panel ff-segpanel">
                <div className="ff-seg-h">
                  <span className={`icon-tile ${tone(seg.tone)} lg`}><SegIcon name={seg.icon} /></span>
                  <div><h2>{seg.name}</h2><p>{seg.description ?? "Custom segment"}</p><code className="ff-key">{seg.key}</code></div>
                  <span className="spacer" />
                  <button type="button" className="btn ghost sm" onClick={() => setModal("edit")}><Pencil />Edit</button>
                  <button type="button" className="icon-btn-sm" aria-label="More" onClick={(e) => setMenuAt(menuAt ? null : e.currentTarget)}><EllipsisVertical /></button>
                </div>
                <div className="ff-segbody">
                  <div className="ff-segrules">
                    <div className="ff-sec-h"><span className="ff-secn"><ListFilter /></span><div><b>Membership rules</b><small>A tenant is in the segment when it matches <b>all</b> rules.</small></div></div>
                    <RuleBuilder rules={draft} onChange={setDraft} options={options} counts={evalr?.ruleCounts} problems={ruleProblems} />
                  </div>
                  <div className="ff-segcount">
                    <div className="ff-ring" style={{ ["--p" as string]: total ? ((n / total) * 100).toFixed(1) : 0 }}>
                      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className="trk" /><circle cx="60" cy="60" r="52" className="arc" pathLength={100} /></svg>
                      <div><b>{n}</b><small>of {total} tenants</small></div>
                    </div>
                    <div className="ff-segbreak">
                      {(evalr?.byPlan ?? []).map((b) => (
                        <div key={b.plan ?? "none"} className="ff-sbrow"><span className={`ff-plan ${planCls(b.plan)}`}>{b.label}</span>
                          <span className="ff-mbar"><i style={{ ["--w" as string]: `${n ? (b.count / n) * 100 : 0}%` }} /></span><b>{b.count}</b></div>
                      ))}
                    </div>
                  </div>
                </div>
                {dirty && (
                  <div className="ff-segfoot ff-sb-in">
                    <span><PencilLine />Unsaved rule changes · <b>{evalr ? `${n - seg.memberCount >= 0 ? "+" : "−"}${Math.abs(n - seg.memberCount)} tenants vs saved` : "…"}</b></span>
                    <span className="spacer" />
                    <button type="button" className="btn ghost sm" onClick={() => setDraft(seg.rules)}>Discard</button>
                    <button type="button" className="btn primary sm" disabled={busy || !valid} title={valid ? undefined : "Give every rule a value"} onClick={saveRules}><Check />{busy ? "Saving…" : "Save segment"}</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2 ff-seggrid">
            <div className="panel">
              <div className="panel-head"><div><h3>Matching tenants</h3><p>{n ? `Showing ${Math.min(12, n)} of ${n}` : "Nobody matches yet"}</p></div></div>
              {evalr && evalr.tenants.length > 0 ? (
                <>
                  <div className="ff-tprev">
                    {evalr.tenants.slice(0, 12).map((t, i) => (
                      <div key={t.id} className="ff-tp" style={{ ["--i" as string]: i }}>
                        <span className="avatar sm">{initials(t.name)}</span>
                        <div><b>{t.name}</b><small>{[t.city, t.industry, t.matchedBy === "INCLUDE" ? "included manually" : null].filter(Boolean).join(" · ") || t.code}</small></div>
                        {t.plan ? <span className={`ff-plan ${planCls(t.plan)}`}>{options?.plans.find((p) => p.code === t.plan)?.name ?? t.plan}</span> : <span className="badge neutral">No plan</span>}
                      </div>
                    ))}
                  </div>
                  {evalr.tenants.length > 12 && <div className="ff-more2">+ {evalr.tenants.length - 12} more tenants</div>}
                </>
              ) : (
                <div className="empty-state ff-empty"><span className="icon-well lg"><UsersRound /></span><b>No tenants match</b><small>Loosen a rule or add values.</small></div>
              )}
            </div>
            <div className="panel">
              <div className="panel-head"><div><h3>Flags using this segment</h3><p>{seg.flagsUsing.length ? "Editing the rules changes who these flags serve" : "Not referenced by any flag yet"}</p></div></div>
              {seg.flagsUsing.length ? (
                <div className="ff-segflags">
                  {seg.flagsUsing.map((f) => (
                    <Link key={f.key} className="ff-segflag" href={`/admin/features?flag=${encodeURIComponent(f.key)}`}>
                      <span className="ff-ficon"><Flag /></span><span><code className="ff-key">{f.key}</code><small>{f.name}</small></span><ArrowUpRight />
                    </Link>
                  ))}
                </div>
              ) : <div className="ff-rules-empty"><FlagOff />Add it to a flag from the flag&apos;s Rules section: <b>Segment is one of</b>.</div>}
            </div>
          </div>

          <OverridesPanel seg={seg} options={options} busy={busy} onSave={saveOverrides} />
        </>
      )}

      <Menu anchor={menuAt} items={menu} onClose={() => setMenuAt(null)} />
      {modal && <SegmentModal key={modal + (seg?.id ?? "")} seg={modal === "edit" ? seg : null} segments={segments ?? []} onClose={() => setModal(null)}
        onSaved={(s, created) => { setModal(null); setSelId(s.id); reload(); toast(created ? `Segment “${s.name}” created` : "Segment updated", { tone: "good" }); }} />}
      <ConfirmDialog open={removing} onClose={() => setRemoving(false)} onConfirm={remove} busy={busy} danger confirmLabel="Delete" title={`Delete “${seg?.name ?? ""}”?`}>
        No flags or broadcasts use it, so nothing changes for tenants. Its key can&apos;t be reused.
      </ConfirmDialog>
      <ConfirmDialog open={!!pendingSel} onClose={() => setPendingSel(null)} danger confirmLabel="Discard" title="Discard rule changes?"
        onConfirm={() => { setSelId(pendingSel); setPendingSel(null); }}>This segment has unsaved rule edits.</ConfirmDialog>
      <Modal open={history && !!seg} onClose={() => setHistory(false)} title={`${seg?.name ?? ""} · history`} wide>
        {seg && <AdminHistoryTab table="TenantSegments" id={seg.id} reloadKey={seg.rowVersion} labels={{ TenantSegmentRules: "Rule", SegmentTenants: "Override" }} />}
      </Modal>
    </>
  );
}

/** Template mountRules (9J-flags.js 468) for segments: IF / AND rows of attribute, operator, values and a tenant count. */
function RuleBuilder({ rules, onChange, options, counts, problems }: {
  rules: SegmentRule[]; onChange: (r: SegmentRule[]) => void; options: SegmentOptions | null; counts?: number[]; problems: Record<string, string>[];
}) {
  const [addAt, setAddAt] = useState<{ el: HTMLElement; i: number } | null>(null);
  const upd = (i: number, patch: Partial<SegmentRule>) => onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addItems: MenuItem[] = useMemo(() => {
    if (!addAt) return [];
    const r = rules[addAt.i];
    if (!r) return [];
    const Icon = ATTRS[r.attribute].icon;
    return valueOptions(r.attribute, options).filter((v) => !r.values.includes(v.code))
      .map((v) => ({ label: v.label, icon: <Icon />, onClick: () => upd(addAt.i, { values: [...r.values, v.code] }) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAt, rules, options]);
  const label = (a: SegmentAttribute, code: string) => valueOptions(a, options).find((v) => v.code === code)?.label ?? code;

  return (
    <div className="ff-rules">
      {rules.length === 0 && <div className="ff-rules-empty"><ListFilter />No rules yet. Add one to start matching tenants.</div>}
      {rules.map((r, i) => {
        const numeric = NUMERIC_SEGMENT_ATTRIBUTES.includes(r.attribute);
        const free = r.attribute === "CITY";
        const problem = Object.values(problems[i] ?? {})[0];
        return (
          <div key={i} className="ff-rule" style={{ ["--i" as string]: i }}>
            <span className="ff-if">{i === 0 ? "IF" : "AND"}</span>
            <select aria-label="Attribute" value={r.attribute} onChange={(e) => { const a = e.target.value as SegmentAttribute; upd(i, { attribute: a, operator: opsFor(a)[0]!, values: [] }); }}>
              {ATTR_ORDER.map((a) => <option key={a} value={a}>{ATTRS[a].label}</option>)}
            </select>
            <select aria-label="Operator" className="ff-op" value={r.operator} onChange={(e) => upd(i, { operator: e.target.value as SegmentOperator, values: numeric ? r.values.slice(0, 1) : r.values })}>
              {opsFor(r.attribute).map((o) => <option key={o} value={o}>{OPS[o]}</option>)}
            </select>
            <div className="ff-vals">
              {numeric ? (
                <input className="ff-valin" value={r.values[0] ?? ""} placeholder={r.attribute === "APP_VERSION" ? "4.11.0" : "30"} inputMode={r.attribute === "APP_VERSION" ? "text" : "numeric"}
                  aria-label="Value" onChange={(e) => upd(i, { values: e.target.value.trim() ? [e.target.value.trim()] : [] })} />
              ) : (
                <>
                  {r.values.map((v) => (
                    <span key={v} className="ff-vchip">{label(r.attribute, v)}<button type="button" aria-label={`Remove ${v}`} onClick={() => upd(i, { values: r.values.filter((x) => x !== v) })}><X /></button></span>
                  ))}
                  {free ? <CityInput onAdd={(c) => !r.values.includes(c) && upd(i, { values: [...r.values, c] })} cities={options?.cities ?? []} /> : (
                    valueOptions(r.attribute, options).some((v) => !r.values.includes(v.code)) &&
                    <button type="button" className="ff-addval" onClick={(e) => setAddAt({ el: e.currentTarget, i })}><Plus />{r.values.length ? "" : "Add value"}</button>
                  )}
                </>
              )}
            </div>
            <span className="ff-rule-end">
              <em className="ff-rule-n">{counts?.[i] ?? "–"}<small>tenants</small></em>
              <button type="button" className="icon-btn-sm ff-rm" aria-label="Remove rule" onClick={() => onChange(rules.filter((_, k) => k !== i))}><Trash2 /></button>
            </span>
            {problem && <small className="hint text-danger" role="alert" style={{ flexBasis: "100%" }}>{problem}</small>}
          </div>
        );
      })}
      <button type="button" className="ff-addrule" disabled={rules.length >= 20} onClick={() => onChange([...rules, { attribute: "PLAN", operator: "IN", values: [] }])}><Plus />Add rule</button>
      <Menu anchor={addAt?.el ?? null} items={addItems} onClose={() => setAddAt(null)} />
    </div>
  );
}

/** Free-text city with suggestions from tenants' cities (CITY compares case-insensitively). */
function CityInput({ onAdd, cities }: { onAdd: (c: string) => void; cities: string[] }) {
  const [v, setV] = useState("");
  const add = () => { const c = v.trim(); if (c) { onAdd(c); setV(""); } };
  return (
    <>
      <input className="ff-valin" list="seg-cities" value={v} placeholder="Add city" aria-label="City" onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} />
      <datalist id="seg-cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
    </>
  );
}

/** Template-style addition: tenants always in (INCLUDE) or always out (EXCLUDE) of the segment, whatever the rules say. */
function OverridesPanel({ seg, options, busy, onSave }: { seg: Segment; options: SegmentOptions | null; busy: boolean; onSave: (o: SegmentOverride[], msg: string) => void }) {
  const [tenantId, setTenantId] = useState("");
  const current: SegmentOverride[] = seg.overrides.map(({ tenantId: t, membership }) => ({ tenantId: t, membership }));
  const free = (options?.tenants ?? []).filter((t) => !current.some((o) => o.tenantId === t.id));
  const add = (membership: SegmentOverride["membership"]) => {
    const t = options?.tenants.find((x) => x.id === tenantId);
    if (!t) return;
    onSave([...current, { tenantId, membership }], `${t.name} ${membership === "INCLUDE" ? "always included" : "always excluded"}`);
    setTenantId("");
  };
  return (
    <div className="panel">
      <div className="panel-head"><div><h3>Include &amp; exclude tenants</h3><p>Manual overrides. Excluded tenants are never in the segment; included ones always are, whatever the rules say.</p></div></div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Tenant" style={{ minWidth: 240 }}>
          <option value="">Choose a tenant…</option>
          {free.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
        </select>
        <button type="button" className="btn secondary sm" disabled={!tenantId || busy} onClick={() => add("INCLUDE")}><UserPlus />Include</button>
        <button type="button" className="btn secondary sm" disabled={!tenantId || busy} onClick={() => add("EXCLUDE")}><UserMinus />Exclude</button>
      </div>
      {seg.overrides.length === 0 ? <p className="muted small ap-mt">No overrides: membership follows the rules only.</p> : (
        <div className="table-wrap ap-mt"><table className="tbl">
          <thead><tr><th>Tenant</th><th>Override</th><th /></tr></thead>
          <tbody>
            {seg.overrides.map((o) => (
              <tr key={o.tenantId}>
                <td><b>{o.tenantName}</b><small>{o.tenantCode}</small></td>
                <td>{o.membership === "INCLUDE" ? <span className="badge good dot">Always included</span> : <span className="badge danger dot">Always excluded</span>}</td>
                <td className="actions"><div className="row ap-nowrap">
                  <button type="button" className="btn ghost sm" disabled={busy}
                    onClick={() => onSave(current.map((x) => (x.tenantId === o.tenantId ? { ...x, membership: x.membership === "INCLUDE" ? "EXCLUDE" : "INCLUDE" } : x)), `${o.tenantName} ${o.membership === "INCLUDE" ? "now excluded" : "now included"}`)}>
                    {o.membership === "INCLUDE" ? "Exclude instead" : "Include instead"}</button>
                  <button type="button" className="icon-btn-sm" aria-label="Remove override" disabled={busy}
                    onClick={() => onSave(current.filter((x) => x.tenantId !== o.tenantId), `Override for ${o.tenantName} removed`)}><X /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

/** Template "New / Edit segment" modal: name, read-only key, description, icon, colour and (new) start from. */
function SegmentModal({ seg, segments, onClose, onSaved }: { seg: Segment | null; segments: Segment[]; onClose: () => void; onSaved: (s: Segment, created: boolean) => void }) {
  const [name, setName] = useState(seg?.name ?? "");
  const [desc, setDesc] = useState(seg?.description ?? "");
  const [icon, setIcon] = useState(seg?.icon ?? "users-round");
  const [tn, setTn] = useState(seg?.tone ?? "GREEN");
  const [start, setStart] = useState<"blank" | "city" | "plan">("blank");
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const save = useCallback(async () => {
    const nm = name.trim();
    if (!nm) { setErr({ name: "Name the segment" }); nameRef.current?.focus(); return; }
    if (segments.some((s) => s.name.toLowerCase() === nm.toLowerCase() && s.id !== seg?.id)) { setErr({ name: "A segment with that name exists" }); return; }
    setBusy(true);
    try {
      if (seg) {
        onSaved(await updateSegment(seg.id, { name: nm, description: desc, icon, tone: tn as SegmentTone, rowVersion: seg.rowVersion }), false);
      } else {
        const rules: SegmentRule[] = start === "city" ? [{ attribute: "CITY", operator: "IN", values: ["Karachi"] }] : start === "plan" ? [{ attribute: "PLAN", operator: "IN", values: ["GROWTH"] }] : [];
        onSaved(await createSegment({ name: nm, description: desc || null, icon, tone: tn as SegmentTone, rules }), true);
      }
    } catch (e) {
      setErr(adminFieldErrors(e));
      toast(adminErrorMessage(e, "Could not save the segment"), { tone: "danger" });
    } finally {
      setBusy(false);
    }
  }, [name, desc, icon, tn, start, seg, segments, onSaved, toast]);

  return (
    <Modal open onClose={onClose} title={seg ? "Edit segment" : "New segment"}
      subtitle={seg ? "Rules are edited in the panel; this changes the name and look." : "Name it, then add rules in the editor. Membership updates live."}
      foot={<><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={save}><Check />{seg ? "Save" : "Create segment"}</button></>}>
      <div className="form-grid">
        <label className="full"><span>Name *</span><input ref={nameRef} value={name} maxLength={40} placeholder="e.g. Karachi distributors" aria-invalid={!!err.name} onChange={(e) => { setName(e.target.value); setErr({}); }} autoFocus />
          {err.name && <small className="hint text-danger" role="alert">{err.name}</small>}</label>
        <label className="full"><span>Key</span><input readOnly className="ff-mono-in" value={seg ? seg.key : segmentKeyFor(name)} />
          <small className="hint">{seg ? "Fixed: flags and broadcasts link to it." : "Set from the name; it can't change later."}</small></label>
        <label className="full"><span>Description</span><textarea rows={2} value={desc} maxLength={300} placeholder="Who is in it and why" onChange={(e) => setDesc(e.target.value)} /></label>
        <div className="full field"><span>Icon &amp; colour</span>
          <div className="ff-iconpick">{Object.entries(ICONS).map(([k, I]) => <button key={k} type="button" className={k === icon ? "on" : undefined} aria-label={k} onClick={() => setIcon(k)}><I /></button>)}</div>
          <div className="ff-tonepick">{SEGMENT_TONES.map((t) => <button key={t} type="button" className={cn("icon-tile", tone(t), t === tn && "on")} aria-label={t.toLowerCase()} onClick={() => setTn(t)} />)}</div>
        </div>
        {!seg && (
          <div className="full field"><span>Start from</span>
            <div className="radio-cards ff-starts">
              {([["blank", "Blank", "No rules"], ["city", "City", "City is one of…"], ["plan", "Plan", "Plan is one of…"]] as const).map(([v, b, s]) => (
                <label key={v} className="radio-card"><input type="radio" name="start" checked={start === v} onChange={() => setStart(v)} /><div><b>{b}</b><small>{s}</small></div></label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
