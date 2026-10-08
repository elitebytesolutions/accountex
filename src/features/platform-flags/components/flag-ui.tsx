"use client";

import { BadgeCheck, Boxes, FlaskConical, Landmark, LayoutDashboard, MessageCircle, Power, Rocket, ShoppingCart, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FlagEnvironment, FlagOptions, FlagVariation } from "@/shared";
import { cn } from "@/components/ui/cn";
import { flagOptions } from "../api";

/** Template TYPES (9J-flags.js): icon, label, blurb and whether the type is temporary by default. */
export const FLAG_TYPE_INFO: Record<string, { label: string; icon: LucideIcon; css: string; temp: boolean; blurb: string }> = {
  RELEASE: { label: "Release", icon: Rocket, css: "release", temp: true, blurb: "Ship code dark, then roll it out gradually. Temporary: remove it once it is at 100%." },
  KILL: { label: "Kill switch", icon: Power, css: "kill", temp: false, blurb: "A permanent off-switch for a risky dependency (FBR API, heavy reports). Flipping it needs the key typed." },
  OPS: { label: "Ops", icon: Wrench, css: "ops", temp: false, blurb: "Operational toggles such as read-only mode or SMS fallback. Permanent and usually global." },
  EXPERIMENT: { label: "Experiment", icon: FlaskConical, css: "experiment", temp: true, blurb: "A/B test with sticky buckets and a metric. Temporary: archive it when the experiment ends." },
  ENTITLEMENT: { label: "Entitlement", icon: BadgeCheck, css: "entitlement", temp: false, blurb: "What a plan or add-on unlocks. Permanent and driven by Plan Entitlements, not by rollouts." },
};

export function TypeBadge({ type, sm }: { type: string; sm?: boolean }) {
  const t = FLAG_TYPE_INFO[type];
  if (!t) return null;
  const Icon = t.icon;
  return <span className={cn("ff-type", `t-${t.css}`, sm && "sm")}><Icon />{t.label}</span>;
}

export function FlagIcon({ type, lg }: { type: string; lg?: boolean }) {
  const t = FLAG_TYPE_INFO[type] ?? FLAG_TYPE_INFO.RELEASE!;
  const Icon = t.icon;
  return <span className={cn("ff-ficon", `t-${t.css}`, lg && "lg")}><Icon /></span>;
}

export const STAGES: { code: string; label: string; hint: string }[] = [
  { code: "DEFINE", label: "Define", hint: "Spec & key agreed" },
  { code: "DEVELOP", label: "Develop", hint: "Code behind the flag" },
  { code: "PRODUCTION", label: "Production", hint: "Serving tenants" },
  { code: "CLEANUP", label: "Cleanup", hint: "Remove code refs" },
  { code: "ARCHIVED", label: "Archived", hint: "No longer evaluated" },
];
export const stageLabel = (s: string) => STAGES.find((x) => x.code === s)?.label ?? s;
export const StagePill = ({ stage }: { stage: string }) => <span className={cn("ff-stage", `s-${stage.toLowerCase()}`)}>{stageLabel(stage)}</span>;

export const ENVS: { code: FlagEnvironment; label: string; short: string; css: string }[] = [
  { code: "DEV", label: "Dev", short: "D", css: "dev" },
  { code: "STAGING", label: "Staging", short: "S", css: "staging" },
  { code: "PRODUCTION", label: "Production", short: "P", css: "production" },
];
export const envLabel = (e: string) => ENVS.find((x) => x.code === e)?.label ?? (e === "ALL" ? "All environments" : e);
export const envCss = (e: string) => ENVS.find((x) => x.code === e)?.css ?? "all";
export const EnvDot = ({ env }: { env: string }) => <span className={cn("ff-env-dot", `e-${envCss(env)}`)} />;

/** Template CATS + CAT_ICON (9J-flags.js). */
export const CATEGORIES: { code: string; label: string; icon: LucideIcon }[] = [
  { code: "COMPLIANCE", label: "Compliance", icon: Landmark }, { code: "SALES", label: "Sales", icon: ShoppingCart }, { code: "INVENTORY", label: "Inventory", icon: Boxes },
  { code: "FINANCE", label: "Finance", icon: Wallet }, { code: "HRMS", label: "HRMS", icon: Users }, { code: "COMMUNICATION", label: "Communication", icon: MessageCircle },
  { code: "PLATFORM", label: "Platform", icon: LayoutDashboard },
];
export const categoryLabel = (c: string) => CATEGORIES.find((x) => x.code === c)?.label ?? c;

export const isKill = (f: { flagType: string; secondaryType: string | null }) => f.flagType === "KILL" || f.secondaryType === "KILL";
export const variationName = (vars: FlagVariation[], i: number | null | undefined) => (i === null || i === undefined ? "—" : (vars.find((v) => v.idx === i)?.name ?? `#${i}`));

const TONES = ["", "c2", "c3", "c4", "c5", "c6"];
const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const initials = (n: string) => n.replace(/\(.*?\)|&|\./g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const Avatar = ({ name, size = "xs" }: { name: string; size?: "xs" | "sm" }) => (
  <span className={cn("avatar", size, TONES[hash(name) % TONES.length])} title={name}>{initials(name) || "?"}</span>
);

export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

/** Select values of the flag pages (plans, segments, tenants, modules, flags, staff). */
export function useFlagOptions(reloadKey?: unknown): FlagOptions | null {
  const [o, setO] = useState<FlagOptions | null>(null);
  useEffect(() => {
    let cancelled = false;
    flagOptions().then((x) => !cancelled && setO(x)).catch(() => !cancelled && setO({ plans: [], segments: [], tenants: [], modules: [], flags: [], staff: [] }));
    return () => { cancelled = true; };
  }, [reloadKey]);
  return o;
}

/** "Type the key to confirm" modal for kill switches (template killConfirm()). */
export function KillConfirm({ flagKey, env, turnOn, busy, onConfirm, onClose }: {
  flagKey: string; env: string; turnOn: boolean; busy?: boolean; onConfirm: (key: string) => void; onClose: () => void;
}) {
  const [v, setV] = useState("");
  const good = v.trim() === flagKey;
  return createPortal(
    <div className="overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ff-modal ff-sm" role="dialog" aria-modal aria-label={`${turnOn ? "Restore" : "Flip"} kill switch`}>
        <div className="modal-head"><div><h2>{turnOn ? "Restore" : "Flip"} kill switch</h2></div><button type="button" className="x" onClick={onClose} aria-label="Close">×</button></div>
        <div className="ff-mbody">
          <div className={cn("ff-kill", turnOn && "restore")}>
            <span className={cn("icon-well lg", !turnOn && "red")}><Power /></span>
            <div>
              <p>{turnOn ? <>Turning <b className="ff-mono">{flagKey}</b> back ON resumes it for every tenant in <b>{envLabel(env)}</b>.</> : <>Turning <b className="ff-mono">{flagKey}</b> OFF affects <b>all tenants</b> in <b>{envLabel(env)}</b> immediately.</>}</p>
              {env === "PRODUCTION" && <p className="ff-note">Kill switches skip the approval queue. The flip is logged as an emergency change.</p>}
            </div>
          </div>
          <label className="field"><span>Type <b className="ff-mono">{flagKey}</b> to confirm</span>
            <input autoFocus autoComplete="off" spellCheck={false} className={cn("ff-mono-in", good && "ff-ok")} placeholder={flagKey} value={v}
              onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && good && onConfirm(v.trim())} />
          </label>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className={cn("btn", turnOn ? "primary" : "danger solid")} disabled={!good || busy} onClick={() => onConfirm(v.trim())}><Power />{busy ? (turnOn ? "Restoring…" : "Killing…") : turnOn ? "Restore" : "Kill it"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
