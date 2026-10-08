"use client";

import { GripVertical, ListFilter, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { FLAG_NUMERIC_ATTRIBUTES, type FlagOptions, type FlagRuleInput, type FlagVariation, type LookupsResponse } from "@/shared";
import { cn } from "@/components/ui/cn";
import { Menu } from "@/components/ui/menu";

/** Template ATTRS / OPS (9J-flags.js) for flag rules. */
export const ATTR_LABELS: Record<string, string> = {
  SEGMENT: "Segment", PLAN: "Plan", REGION: "Region", CITY: "City", INDUSTRY: "Industry", AGE_DAYS: "Tenant age (days)",
  USER_ROLE: "User role", APP_VERSION: "App version", PLATFORM: "Platform",
};
export const OP_LABELS: Record<string, string> = { IN: "is one of", NOT_IN: "is not one of", GT: "greater than", LT: "less than" };
const opsFor = (attr: string) => (FLAG_NUMERIC_ATTRIBUTES.includes(attr) ? ["GT", "LT", "IN"] : ["IN", "NOT_IN"]);

/** The values a rule can pick for an attribute (null = typed free text). */
function choices(attr: string, o: FlagOptions | null, lk: LookupsResponse): { value: string; label: string }[] | null {
  switch (attr) {
    case "SEGMENT": return (o?.segments ?? []).map((s) => ({ value: s.key, label: s.name }));
    case "PLAN": return (o?.plans ?? []).map((p) => ({ value: p.code, label: p.name }));
    case "REGION": return (lk.Province ?? []).map((x) => ({ value: x.code, label: x.label }));
    case "INDUSTRY": return (lk.TenantIndustry ?? []).map((x) => ({ value: x.code, label: x.label }));
    case "PLATFORM": return ["WEB", "ANDROID", "IOS", "DESKTOP"].map((v) => ({ value: v, label: v.charAt(0) + v.slice(1).toLowerCase() }));
    default: return null;
  }
}

/**
 * Template mountRules(): IF / ELSE IF rows with attribute, operator, value chips and the served variation; first match
 * wins, drag the grip to reorder.
 */
export function RuleBuilder({ rules, onChange, variations, options, lookups, errors }: {
  rules: FlagRuleInput[]; onChange: (r: FlagRuleInput[]) => void; variations: FlagVariation[];
  options: FlagOptions | null; lookups: LookupsResponse; errors?: Record<string, string>;
}) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; i: number } | null>(null);
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [from, setFrom] = useState(-1);
  const set = (i: number, r: Partial<FlagRuleInput>) => onChange(rules.map((x, k) => (k === i ? { ...x, ...r } : x)));
  const labelFor = (attr: string, v: string) => choices(attr, options, lookups)?.find((c) => c.value === v)?.label ?? v;

  const addTyped = (i: number) => {
    const v = (typed[i] ?? "").trim();
    if (v && !rules[i]!.ruleValues.includes(v)) set(i, { ruleValues: [...rules[i]!.ruleValues, v] });
    setTyped({ ...typed, [i]: "" });
  };

  return (
    <div className="ff-rules">
      {rules.length === 0 && <div className="ff-rules-empty"><ListFilter />No rules. Everyone falls through to the default rule.</div>}
      {rules.map((r, i) => {
        const opts = choices(r.attribute, options, lookups);
        const scalar = r.operator === "GT" || r.operator === "LT";
        const left = (opts ?? []).filter((c) => !r.ruleValues.includes(c.value));
        const err = errors?.[`rules.${i}.ruleValues`] ?? errors?.[`rules.${i}.operator`] ?? errors?.[`rules.${i}.serveVariationIdx`];
        return (
          <div key={i} className="ff-rule" draggable style={{ ["--i" as string]: i }}
            onDragStart={() => setFrom(i)} onDragEnd={() => setFrom(-1)} onDragOver={(e) => from >= 0 && e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (from < 0 || from === i) return; const next = [...rules]; const [m] = next.splice(from, 1); next.splice(i, 0, m!); onChange(next); setFrom(-1); }}>
            <span className="ff-grip" title="Drag to reorder" aria-hidden><GripVertical /></span>
            <span className="ff-if">{i === 0 ? "IF" : "ELSE IF"}</span>
            <select aria-label="Attribute" value={r.attribute} onChange={(e) => set(i, { attribute: e.target.value as FlagRuleInput["attribute"], operator: opsFor(e.target.value)[0] as FlagRuleInput["operator"], ruleValues: [] })}>
              {Object.entries(ATTR_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select aria-label="Operator" className="ff-op" value={r.operator} onChange={(e) => set(i, { operator: e.target.value as FlagRuleInput["operator"], ruleValues: e.target.value === "GT" || e.target.value === "LT" ? r.ruleValues.slice(0, 1) : r.ruleValues })}>
              {opsFor(r.attribute).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
            </select>
            <div className="ff-vals">
              {scalar ? (
                <input className={cn("ff-valin", err && "ff-invalid")} value={r.ruleValues[0] ?? ""} placeholder={r.attribute === "APP_VERSION" ? "4.11.0" : "30"} inputMode={r.attribute === "AGE_DAYS" ? "numeric" : "text"}
                  onChange={(e) => set(i, { ruleValues: e.target.value.trim() ? [e.target.value.trim()] : [] })} />
              ) : (
                <>
                  {r.ruleValues.map((v) => <span key={v} className="ff-vchip">{labelFor(r.attribute, v)}<button type="button" aria-label={`Remove ${v}`} onClick={() => set(i, { ruleValues: r.ruleValues.filter((x) => x !== v) })}><X /></button></span>)}
                  {opts ? (left.length > 0 && <button type="button" className="ff-addval" onClick={(e) => setMenu({ anchor: e.currentTarget, i })}><Plus />{r.ruleValues.length ? "" : "Add value"}</button>) : (
                    <input className="ff-valin" value={typed[i] ?? ""} placeholder={r.attribute === "CITY" ? "Lahore ⏎" : r.attribute === "USER_ROLE" ? "ADMIN ⏎" : "value ⏎"}
                      onChange={(e) => setTyped({ ...typed, [i]: e.target.value })} onBlur={() => addTyped(i)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(i); } }} />
                  )}
                </>
              )}
            </div>
            <span className="ff-then">serve</span>
            <select className="ff-serve" aria-label="Serve variation" value={r.serveVariationIdx} onChange={(e) => set(i, { serveVariationIdx: Number(e.target.value) })}>
              {variations.map((v) => <option key={v.idx} value={v.idx}>{v.name}</option>)}
            </select>
            <span className="ff-rule-end">
              <button type="button" className="icon-btn-sm ff-rm" aria-label="Remove rule" onClick={() => onChange(rules.filter((_, k) => k !== i))}><Trash2 /></button>
            </span>
            {err && <small className="hint text-danger" style={{ flexBasis: "100%" }}>{err}</small>}
          </div>
        );
      })}
      <button type="button" className="ff-addrule" onClick={() => onChange([...rules, { attribute: "PLAN", operator: "IN", ruleValues: [], serveVariationIdx: 0 }])}><Plus />Add rule</button>
      {menu && (
        <Menu anchor={menu.anchor} onClose={() => setMenu(null)}
          items={(choices(rules[menu.i]?.attribute ?? "", options, lookups) ?? []).filter((c) => !rules[menu.i]?.ruleValues.includes(c.value))
            .map((c) => ({ label: c.label, onClick: () => set(menu.i, { ruleValues: [...(rules[menu.i]?.ruleValues ?? []), c.value] }) }))} />
      )}
    </div>
  );
}
