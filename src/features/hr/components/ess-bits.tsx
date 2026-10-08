"use client";

import { Check, Loader, Minus, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { initialsOf } from "@/features/auth/initials";

/** React ports of the template's ESS helpers (9C-ess.js ES.ring / ES.tracker / ES.av) used by My Profile screens. */
export function EsRing({ pct, size = 72, stroke = 3.6, tone = "var(--primary)", label, sub, className, id }: {
  pct: number; size?: number; stroke?: number; tone?: string; label?: ReactNode; sub?: ReactNode; className?: string; id?: string;
}) {
  const p = Math.max(0, Math.min(100, pct));
  const r = 18 - stroke / 2;
  return (
    <div id={id} className={`es-ring ${className ?? ""}`} style={{ ["--sz" as string]: `${size}px`, ["--c" as string]: tone } as CSSProperties} data-p={p}>
      <svg viewBox="0 0 36 36" aria-hidden><circle className="t" cx="18" cy="18" r={r} strokeWidth={stroke} /><circle className="v" cx="18" cy="18" r={r} strokeWidth={stroke} pathLength={100} strokeDasharray={100} strokeDashoffset={100 - p} /></svg>
      <div className="es-ring-in">{label ?? `${Math.round(p)}%`}{sub && <small>{sub}</small>}</div>
    </div>
  );
}

/** Status tracker: steps done before `at`, the step `at` now / rejected / cancelled. */
export function EsTracker({ steps, at, state = "ok", subs = [], small }: { steps: string[]; at: number; state?: "ok" | "rej" | "cancel"; subs?: (string | null)[]; small?: boolean }) {
  return (
    <ol className={`es-track${small ? " sm" : ""}${state === "rej" ? " is-rej" : state === "cancel" ? " is-cancel" : ""}`}>
      {steps.map((s, i) => {
        const c = i < at ? "done" : i === at ? (state === "rej" ? "rej" : state === "cancel" ? "cancel" : i === steps.length - 1 ? "done" : "now") : "";
        const Ic = c === "done" ? Check : c === "rej" ? X : c === "cancel" ? Minus : c === "now" ? Loader : null;
        return <li key={s} className={c} style={{ ["--i" as string]: i } as CSSProperties}><span className="es-track-dot">{Ic && <Ic />}</span><b>{s}</b>{subs[i] && <small>{subs[i]}</small>}</li>;
      })}
    </ol>
  );
}

const TONES = ["", "c2", "c3", "c4", "c5", "c6", "lime"];
const tone = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };
export const Av = ({ name, size = "sm" }: { name: string; size?: "" | "xs" | "sm" | "lg" | "xl" }) => <span className={`avatar ${size} ${tone(name)}`} title={name}>{initialsOf(name)}</span>;
