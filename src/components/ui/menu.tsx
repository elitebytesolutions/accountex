"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export type MenuItem = { label: string; icon?: ReactNode; danger?: boolean; disabled?: boolean; onClick: () => void } | { sep: true };

/**
 * Template FS.menu (95-ui.js): a small action menu under its anchor, flipped above when there is no room.
 * Closes on outside click, Escape or scroll.
 */
export function Menu({ anchor, items, onClose }: { anchor: HTMLElement | null; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const mw = ref.current.offsetWidth, mh = ref.current.offsetHeight;
    let left = r.right - mw, top = r.bottom + 6;
    if (left < 8) left = r.left;
    if (top + mh > innerHeight - 8) top = r.top - mh - 6;
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;
  return createPortal(
    <div ref={ref} className="fs-menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}>
      {items.map((it, i) =>
        "sep" in it ? <hr key={i} /> : (
          <button key={i} type="button" role="menuitem" className={cn(it.danger && "danger")} disabled={it.disabled} onClick={() => { onClose(); it.onClick(); }}>
            {it.icon}
            {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
