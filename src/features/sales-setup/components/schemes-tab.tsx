"use client";

import { CalendarRange, Coins, TrendingUp, Users, Zap } from "lucide-react";
import { useState } from "react";
import { schemeHeadline, schemeState, type Scheme, type SchemeSummary } from "@/shared";
import { cn } from "@/components/ui/cn";
import { EmptyState, Skeleton } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { apiMessage } from "@/features/treasury/components/treasury-ui";
import { setSchemeActive } from "../api";
import { dstr, fmt, today, type Can } from "./common";
import { SCHEME_LOOK } from "./scheme-drawer";

const STATE: Record<string, [string, string]> = { LIVE: ["Live", "good"], SCHEDULED: ["Scheduled", "info"], ENDED: ["Ended", "neutral"], OFF: ["Off", "neutral"] };

/** Template `app/sales/price-lists` tab "Schemes": strip, filter and scheme cards with an active switch. */
export function SchemesTab({ schemes, summary, loading, can, onOpen, onChanged }: {
  schemes: Scheme[];
  summary: SchemeSummary | null;
  loading: boolean;
  can: Can;
  onOpen: (s: Scheme) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "live" | "off">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const t = today();
  const shown = schemes.filter((s) => {
    const st = schemeState(s, t);
    return filter === "all" || (filter === "live" ? st === "LIVE" || st === "SCHEDULED" : st === "OFF" || st === "ENDED");
  });
  const toggle = async (s: Scheme, on: boolean) => {
    setBusy(s.id);
    try { await setSchemeActive(s.id, on, s.rowVersion); toast(`${s.name} ${on ? "is now live" : "switched off"}`, { tone: on ? "good" : "info" }); onChanged(); } catch (e) { toast(apiMessage(e, "Could not change the scheme"), { tone: "danger" }); } finally { setBusy(null); }
  };
  const who = (s: Scheme) => {
    const inc = s.eligibility.filter((e) => !e.isExcluded).map((e) => e.label), exc = s.eligibility.filter((e) => e.isExcluded).map((e) => e.label);
    return `${s.appliesToAll ? "All customers" : inc.join(", ") || "Nobody yet"}${exc.length ? ` (not ${exc.join(", ")})` : ""}`;
  };

  return (
    <>
      <div className="cp-sch-strip">
        <div className="pill"><Zap /><b>{summary?.live ?? 0}</b> live schemes</div>
        <div className="pill"><Coins />Discount given <b>Rs {fmt(summary?.valueGiven ?? 0)}</b></div>
        <div className="pill" title="Measured once invoices apply schemes (Phase 21)"><TrendingUp />Scheme sales uplift <b>—</b></div>
        <span className="spacer" />
        <div className="seg">
          {([["all", "All"], ["live", "Live"], ["off", "Off / ended"]] as const).map(([k, l]) => <button key={k} type="button" className={cn(filter === k && "active")} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
      </div>
      {loading && !schemes.length ? <Skeleton style={{ height: 220 }} /> : shown.length ? (
        <div className="cp-sch-grid">
          {shown.map((s, i) => {
            const st = schemeState(s, t), look = SCHEME_LOOK[s.schemeType] ?? SCHEME_LOOK.SERVICE!;
            const budget = s.budgetCap ? Math.min(100, Math.round((s.valueGiven / s.budgetCap) * 100)) : 0;
            return (
              <div key={s.id} className={cn("cp-sch", (st === "LIVE" || st === "SCHEDULED") && "on", st === "ENDED" && "ended")} style={{ ["--i" as string]: i, cursor: "pointer" }}
                role="button" tabIndex={0} onClick={() => onOpen(s)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(s); }}>
                <div className="cp-sch-top">
                  <span className={cn("icon-tile", look.tone)}>{look.icon}</span>
                  <span className={cn("badge dot cp-sch-st", STATE[st]![1])}>{STATE[st]![0]}</span>
                  <label className="switch" title="Active" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={s.isActive && st !== "ENDED"} disabled={!can.approve || st === "ENDED" || busy === s.id} onChange={(e) => void toggle(s, e.target.checked)} /><i />
                  </label>
                </div>
                <h4>{s.name}</h4>
                <p>{s.description || `${schemeHeadline(s)}${s.items.length ? ` · ${s.items.map((x) => x.product.name).slice(0, 2).join(", ")}${s.items.length > 2 ? ` +${s.items.length - 2}` : ""}` : ""}`}</p>
                <div className="cp-sch-meta"><span><CalendarRange />{dstr(s.validFrom)} → {dstr(s.validTo)}</span><span><Users />{who(s)}</span></div>
                <div className="cp-sch-stats"><div><b>{fmt(s.usedCount)}</b><small>Times applied</small></div><div><b>Rs {fmt(s.valueGiven)}</b><small>Discount given</small></div></div>
                <div className="cp-sch-bud"><small>Budget used <b>{s.budgetCap ? `${budget}%` : "no cap"}</b></small><div className={cn("progress", budget > 90 ? "danger" : budget > 60 && "warn")}><i style={{ width: `${budget}%` }} /></div></div>
                <div className="cp-sch-f"><span className="badge neutral">{look.label}</span><span className="spacer" /><span className="muted small">{s.code}</span></div>
              </div>
            );
          })}
        </div>
      ) : <div className="panel"><EmptyState title={schemes.length ? "No schemes in this view" : "No schemes yet"} description={can.approve ? "Use “New scheme” for free goods, discounts, bundles or settlement offers." : "Schemes your approvers create appear here."} /></div>}
    </>
  );
}
