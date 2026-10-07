"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui/cn";

/** Template FS.sheet (95-ui.js): a bottom sheet on phones, a centred card on wider screens; Escape / scrim / × close it. */
export function Sheet({ open, onClose, title, subtitle, foot, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(open);
  const [closing, setClosing] = useState(false);
  const [prev, setPrev] = useState(open);
  if (open !== prev) {
    setPrev(open);
    if (open) { setShown(true); setClosing(false); } else if (shown) setClosing(true);
  }
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(() => { setShown(false); setClosing(false); }, 220);
    return () => clearTimeout(t);
  }, [closing]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!shown) return null;
  return createPortal(
    <div className={cn("overlay sheet-overlay open", closing && "closing")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal aria-label={title}>
        <span className="sheet-grab" />
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>,
    document.body,
  );
}
