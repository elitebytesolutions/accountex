"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { WholesaleOptions } from "@/shared";
import { cn } from "@/components/ui/cn";

/** Helpers and popovers shared by the Quick Wholesale Entry screen (template 9H-wholesale.js). */
export type Opts = WholesaleOptions;
export type Product = Opts["products"][number];
export type Shop = Opts["shops"][number];
export type Scheme = Opts["schemes"][number];
export type Tier = Opts["tiers"][number];

export const num = (s: string | number | null | undefined) => {
  const v = Number(String(s ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : 0;
};
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const grp = (v: number, dec = 2) => Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const rs = (v: number, dec = 0) => `${v < 0 ? "−" : ""}Rs ${grp(v, dec)}`;
export const pk = (p: { ctn: number } | null | undefined) => Math.max(1, p?.ctn || 1);
export const initials = (n: string) => n.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** "3 ctn + 4" / "8 pcs" (template qtyStr). */
export function qtyStr(p: { ctn: number }, pcs: number) {
  const k = pk(p);
  const q = Math.round(pcs);
  if (k === 1) return `${grp(q, 0)} pcs`;
  const c = Math.floor(q / k), r = q % k;
  if (!c) return `${r} pcs`;
  return `${grp(c, 0)} ctn${r ? ` + ${r}` : ""}`;
}

/** The active scheme covering a product (a scheme with no item list covers every product). */
export const schemeFor = (o: Opts, itemId: string) => o.schemes.find((s) => s.itemIds === null || s.itemIds.includes(itemId)) ?? null;
export const schemeLabel = (s: Scheme) => `Buy ${s.buyQty} get ${s.freeQty}`;

export function TierChip({ tier }: { tier: Tier | undefined }) {
  if (!tier) return <span className="ws2-tier">—</span>;
  const off = tier.rateFactor > 0 && tier.rateFactor < 1 ? ` −${Math.round((1 - tier.rateFactor) * 100)}%` : "";
  return <span className={cn("ws2-tier", `t-${tier.name.toLowerCase()}`)}>{tier.name}{off}</span>;
}

/**
 * Template Pop (9H-wholesale.js): a keyboard-driven list anchored under its input, fixed to the viewport, follows
 * scrolling and flips above when there is no room. The input keeps focus (mousedown is swallowed).
 */
export function FloatPop({ anchor, minW, className, onClose, children }: {
  anchor: HTMLElement; minW: number; className?: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      if (!r.width) { onClose(); return; }
      const w = Math.min(innerWidth - 20, Math.max(r.width, minW));
      const h = ref.current?.offsetHeight ?? 0;
      let top = r.bottom + 6;
      if (top + h > innerHeight - 10 && r.top - h - 6 > 0) top = r.top - h - 6;
      const left = Math.max(10, Math.min(r.left, innerWidth - w - 10));
      setPos((p) => (p && p.left === left && p.top === top && p.width === w ? p : { left, top, width: w }));
    };
    place();
    const onScroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) place(); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onClose); };
  });
  useEffect(() => { ref.current?.querySelector("[data-i].on")?.scrollIntoView({ block: "nearest" }); });
  return createPortal(
    <div ref={ref} className={cn("ws2-pop open", className)} style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: "hidden", left: 0, top: 0 }}
      onMouseDown={(e) => e.preventDefault()}>
      {children}
    </div>,
    document.body,
  );
}

/** Template FS.menu with rich rows (`.ws2-mi` two-line labels): under its anchor, closes on outside click, Escape or scroll. */
export function RichMenu({ anchor, onClose, children }: { anchor: HTMLElement; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const r = anchor.getBoundingClientRect();
    const mw = ref.current.offsetWidth, mh = ref.current.offsetHeight;
    let left = r.right - mw, top = r.bottom + 6;
    if (left < 8) left = Math.max(8, r.left);
    if (top + mh > innerHeight - 8 && r.top - mh - 6 > 0) top = r.top - mh - 6;
    setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
  }, [anchor, children]);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const scroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="fs-menu ws2-menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}>
      {children}
    </div>,
    document.body,
  );
}
